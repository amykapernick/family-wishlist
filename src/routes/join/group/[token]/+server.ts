import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGroupByToken, getSessionEpoch, listMemberships } from '#lib/server/db.ts';
import {
	forgetIdentity,
	getEnv,
	getRememberedId,
	getSelfId,
	setFamilyCookie,
	setGroupCookie
} from '#lib/server/session.ts';

// A group's link: lets this device in like the family link, but "Who are
// you?" only offers that group's people.
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const group = await getGroupByToken(env.DB, event.params.token);
	if (!group) error(404, 'This link is not valid. Ask a family member for a new one.');
	await setFamilyCookie(event.cookies, env.COOKIE_SECRET, await getSessionEpoch(env.DB));
	await setGroupCookie(event.cookies, env.COOKIE_SECRET, group.id);

	// Forget whoever this device knew if they aren't in the group.
	const members = new Set(
		(await listMemberships(env.DB)).filter((m) => m.group_id === group.id).map((m) => m.person_id)
	);
	const known = [
		await getSelfId(event.cookies, env.COOKIE_SECRET),
		await getRememberedId(event.cookies, env.COOKIE_SECRET)
	];
	if (known.some((id) => id && !members.has(id))) forgetIdentity(event.cookies);

	// Redirect straight away so the token doesn't linger in the address bar or history.
	redirect(303, '/');
};
