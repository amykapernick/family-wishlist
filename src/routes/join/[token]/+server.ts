import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { timingSafeEqual } from '#lib/server/crypto.ts';
import { getPerson, getSessionEpoch } from '#lib/server/db.ts';
import { clearIdentity, getEnv, setFamilyCookie, setSelfCookie } from '#lib/server/session.ts';

export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	if (!env.FAMILY_TOKEN || !timingSafeEqual(event.params.token, env.FAMILY_TOKEN)) {
		error(404, 'This family link is not valid. Ask a family member for a new one.');
	}
	await setFamilyCookie(event.cookies, env.COOKIE_SECRET, await getSessionEpoch(env.DB));

	// The link texted by the `link` SMS command adds ?me=<person> to pick who
	// this is. It grants nothing the family link doesn't already (anyone with
	// it can choose a person without a PIN), and PIN-protected people still
	// have to enter their PIN.
	const me = event.url.searchParams.get('me');
	const person = me ? await getPerson(env.DB, me) : null;
	if (person) {
		clearIdentity(event.cookies);
		if (person.pin_hash) redirect(303, `/whoami?as=${encodeURIComponent(person.id)}`);
		await setSelfCookie(event.cookies, env.COOKIE_SECRET, person.id, false);
		redirect(303, '/');
	}
	// Redirect straight away so the token doesn't linger in the address bar or history.
	// hooks.server.ts sends them on to /whoami if this device doesn't know who they are.
	redirect(303, '/');
};
