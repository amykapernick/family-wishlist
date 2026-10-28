import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { askAbout, loadAskTargets, sendAsk } from '#lib/server/ask.ts';
import { closeIdeaRequest, getIdeaRequest } from '#lib/server/db.ts';
import { requireIdentity } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const about = askAbout(identity, event.params.id);
	const { requests, names, ...ask } = await loadAskTargets(getEnv().DB, identity, about);
	const nameOf = (id: string) => names.get(id) ?? 'Someone';
	return {
		about,
		actingId: identity.acting.id,
		ask,
		requests: requests.map((r) => ({
			...r,
			fromName: nameOf(r.from_id),
			askedName: nameOf(r.asked_id)
		}))
	};
};

export const actions: Actions = {
	ask: async (event) => {
		const identity = requireIdentity(event.locals);
		const about = askAbout(identity, event.params.id);
		return sendAsk(getEnv().DB, identity, about, await event.request.formData());
	},

	close: async (event) => {
		const identity = requireIdentity(event.locals);
		askAbout(identity, event.params.id);
		const db = getEnv().DB;
		const request = await getIdeaRequest(
			db,
			String((await event.request.formData()).get('request'))
		);
		if (!request || request.about_id !== event.params.id) error(404, 'Request not found.');
		if (request.from_id !== identity.acting.id)
			error(403, 'Only the person who asked can close it.');
		await closeIdeaRequest(db, request.id);
		return { message: 'Request closed.' };
	}
};
