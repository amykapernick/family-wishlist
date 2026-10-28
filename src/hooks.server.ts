import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { getSessionEpoch, listPeople, toPublicPerson } from '#lib/server/db.ts';
import { hasAdminAccess, isLockedFor } from '#lib/server/permissions.ts';
import {
	clearIdentity,
	getActingId,
	getEnv,
	getSelfId,
	getUnlocked,
	hasFamilyCookie
} from '#lib/server/session.ts';

/** Routes reachable without the family cookie. /api/sms checks Twilio's signature instead. */
function isPublic(pathname: string) {
	return pathname === '/pin' || pathname.startsWith('/join/') || pathname === '/api/sms';
}

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/**
 * SvelteKit's own cross-site form check (turned off in vite.config.ts) would
 * also block Twilio, which posts forms with no Origin header. This is the
 * same check, for every route except the webhook.
 */
function isCrossSiteForm(request: Request, url: URL) {
	if (url.pathname === '/api/sms') return false;
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	if (type && !FORM_TYPES.includes(type)) return false;
	return request.headers.get('origin') !== url.origin;
}

async function resolveIdentity(
	event: Parameters<Handle>[0]['event'],
	env: Env
): Promise<App.Identity | null> {
	const selfId = await getSelfId(event.cookies, env.COOKIE_SECRET);
	if (!selfId) return null;

	const rows = await listPeople(env.DB);
	const selfRow = rows.find((p) => p.id === selfId);
	if (!selfRow) return null;

	// A PIN-protected self must have been unlocked this browser session,
	// which also catches a PIN being added after the cookie was issued.
	const unlocked = await getUnlocked(event.cookies, env.COOKIE_SECRET);
	if (selfRow.pin_hash && !unlocked.includes(selfId)) return null;

	// Anyone can act as anyone; people with a PIN need it first (isLockedFor).
	const people = rows.map(toPublicPerson);
	const self = people.find((p) => p.id === selfId)!;
	const actable = [self, ...people.filter((p) => p.id !== selfId)].map((p) => ({
		...p,
		locked: isLockedFor(selfId, p, unlocked)
	}));

	const requested = await getActingId(event.cookies, env.COOKIE_SECRET);
	const target = actable.find((p) => p.id === requested);
	const acting = target && !target.locked ? target : actable[0];

	return { self, acting, actable, people, isAdmin: hasAdminAccess(self) };
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.identity = null;
	const { pathname, search } = event.url;

	// Only in production builds, like SvelteKit's check: in dev, tools and
	// tests post without an Origin header.
	if (!dev && isCrossSiteForm(event.request, event.url)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}

	if (!isPublic(pathname)) {
		const env = getEnv();
		const epoch = await getSessionEpoch(env.DB);
		if (!(await hasFamilyCookie(event.cookies, env.COOKIE_SECRET, epoch))) {
			// Signed out (expired, or an admin signed out every device): forget who they were too.
			clearIdentity(event.cookies);
			redirect(303, `/pin?next=${encodeURIComponent(pathname + search)}`);
		}
		event.locals.identity = await resolveIdentity(event, env);
		if (!event.locals.identity && pathname !== '/whoami') {
			redirect(303, `/whoami?next=${encodeURIComponent(pathname + search)}`);
		}
	}

	const response = await resolve(event);
	// Not no-referrer: that makes browsers send `Origin: null` on our own
	// (non-JS) form posts, which isCrossSiteForm then rejects. same-origin still
	// sends nothing to other sites, so join links never leak.
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
