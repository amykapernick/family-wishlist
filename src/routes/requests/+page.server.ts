import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	answerIdeaRequest,
	getIdeaRequest,
	listRequestsAsked,
	listRequestsFrom,
	nameMap
} from '#lib/server/db.ts';
import { requireIdentity, requiredText } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const db = getEnv().DB;
	// Requests can cross groups (recommenders), so names come from the whole family.
	const names = await nameMap(db);
	const nameOf = (id: string) => names.get(id) ?? 'Someone';
	const named = <T extends { from_id: string; about_id: string; asked_id: string }>(r: T) => ({
		...r,
		fromName: nameOf(r.from_id),
		aboutName: nameOf(r.about_id),
		askedName: nameOf(r.asked_id)
	});
	return {
		inbox: (await listRequestsAsked(db, identity.acting.id)).map(named),
		sent: (await listRequestsFrom(db, identity.acting.id)).map(named)
	};
};

export const actions: Actions = {
	reply: async (event) => {
		const identity = requireIdentity(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const request = await getIdeaRequest(db, String(form.get('request') ?? ''));
		if (!request || request.asked_id !== identity.acting.id) error(404, 'Request not found.');
		const response = requiredText(form, 'response', 'Your ideas', 2000);
		if (response.error)
			return fail(400, { request: request.id, message: 'Write some ideas first.' });
		const self = request.about_id === identity.acting.id;
		const added = await answerIdeaRequest(
			db,
			request,
			response.value,
			self ? null : identity.acting.name
		);
		const about = self ? 'your' : `${(await nameMap(db)).get(request.about_id) ?? 'their'}’s`;
		return {
			message: added.length
				? `Thanks! Your ideas were sent, and ${added.length === 1 ? '1 item was' : `${added.length} items were`} added to ${about} list.`
				: 'Thanks! Your reply was updated.'
		};
	}
};
