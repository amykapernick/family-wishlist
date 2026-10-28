import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	askForIdeas,
	closeIdeaRequest,
	getIdeaRequest,
	listRecommenders,
	listRequestsAbout
} from '#lib/server/db.ts';
import { findPerson, requireIdentity } from '#lib/server/guard.ts';
import { ideaTargets } from '#lib/server/ideas.ts';
import { canSeeSpoilersFor } from '#lib/server/permissions.ts';
import { getEnv } from '#lib/server/session.ts';

function guard(identity: App.Identity, aboutId: string) {
	const about = findPerson(identity, aboutId);
	if (!canSeeSpoilersFor(identity.acting.id, about.id)) {
		error(403, 'You can’t ask for gift ideas about yourself.');
	}
	return about;
}

/** "Alex", "Alex and Sam", "Alex, Sam and June" */
function listNames(names: string[]) {
	return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const about = guard(identity, event.params.id);
	const nameOf = (id: string) => identity.people.find((p) => p.id === id)?.name ?? 'Someone';
	const db = getEnv().DB;
	const [requests, recommenders] = await Promise.all([
		listRequestsAbout(db, about.id),
		listRecommenders(db, about.id)
	]);
	const waitingOn = new Set(
		requests
			.filter((r) => r.from_id === identity.acting.id && r.status === 'open')
			.map((r) => r.asked_id)
	);
	const targets = ideaTargets(recommenders, about.id, identity.acting.id);
	return {
		about,
		actingId: identity.acting.id,
		// Who "Ask for ideas" will go to: the recommenders, or the person themselves.
		asksThemselves: targets.length === 1 && targets[0] === about.id,
		targets: targets.map((id) => ({ id, name: nameOf(id), waiting: waitingOn.has(id) })),
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
		const about = guard(identity, event.params.id);
		const { created, skipped } = await askForIdeas(getEnv().DB, identity.acting.id, about.id);
		const nameOf = (id: string) => (id === about.id ? about.name : findPerson(identity, id).name);
		const parts = [];
		if (created.length) {
			parts.push(`Asked ${listNames(created.map(nameOf))} for ideas about ${about.name}.`);
		}
		if (skipped.length) {
			parts.push(`Still waiting to hear back from ${listNames(skipped.map(nameOf))}.`);
		}
		return { message: parts.join(' ') };
	},

	close: async (event) => {
		const identity = requireIdentity(event.locals);
		guard(identity, event.params.id);
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
