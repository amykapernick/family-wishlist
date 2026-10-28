import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyPin } from '#lib/server/crypto.ts';
import { clearAttempts, getPerson, isThrottled, recordFailedAttempt } from '#lib/server/db.ts';
import { requireIdentity } from '#lib/server/guard.ts';
import { addUnlocked, clientKey, getEnv, safeNext, setActingCookie } from '#lib/server/session.ts';

// The header switcher posts here. Switching to someone with a personal PIN
// shows a PIN form first; the check happens server-side either way.

export const load: PageServerLoad = async ({ locals, url }) => {
	const identity = requireIdentity(locals);
	const target = identity.actable.find((p) => p.id === url.searchParams.get('to'));
	if (!target) redirect(303, '/');
	return { target, next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async (event) => {
		const env = getEnv();
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const next = safeNext(String(form.get('next') ?? '/'));
		const target = identity.actable.find((p) => p.id === form.get('to'));
		if (!target) return fail(403, { message: 'You can’t act as that person.' });

		if (target.locked) {
			const pin = form.get('pin');
			if (typeof pin !== 'string' || pin === '') {
				redirect(303, `/acting?to=${target.id}&next=${encodeURIComponent(next)}`);
			}
			const key = `person:${target.id}:${clientKey(event)}`;
			if (await isThrottled(env.DB, key)) {
				return fail(429, { message: 'Too many attempts. Please wait 15 minutes and try again.' });
			}
			const row = await getPerson(env.DB, target.id);
			if (!(await verifyPin(pin, row?.pin_hash))) {
				await recordFailedAttempt(env.DB, key);
				return fail(400, { message: 'That PIN is not right.' });
			}
			await clearAttempts(env.DB, key);
			await addUnlocked(event.cookies, env.COOKIE_SECRET, target.id);
		}

		await setActingCookie(event.cookies, env.COOKIE_SECRET, target.id);
		redirect(303, next);
	}
};
