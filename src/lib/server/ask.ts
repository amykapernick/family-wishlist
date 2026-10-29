// "Ask for ideas" about someone: who it goes to, and sending it. Shared by
// their wishlist (where the dialog opens) and their idea requests page.

import { error } from '@sveltejs/kit';
import type { AskTargets, IdeaRequestRow, PublicPerson } from '#lib/types.ts';
import { askForIdeas, listRecommenders, listRequestsAbout, nameMap } from './db.ts';
import { findPerson } from './guard.ts';
import { ideaTargets } from './ideas.ts';
import { canSeeSpoilersFor } from './permissions.ts';

/** The person being asked about; never yourself. */
export function askAbout(identity: App.Identity, aboutId: string): PublicPerson {
	const about = findPerson(identity, aboutId);
	if (!canSeeSpoilersFor(identity.acting.id, about.id, identity.self.id)) {
		error(403, 'You can’t ask for gift ideas about yourself.');
	}
	return about;
}

/** "Alex", "Alex and Sam", "Alex, Sam and June" */
export function listNames(names: string[]) {
	return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export async function loadAskTargets(
	db: D1Database,
	identity: App.Identity,
	about: PublicPerson
): Promise<AskTargets & { requests: IdeaRequestRow[]; names: Map<string, string> }> {
	// Recommenders can be outside the asker's groups; requests still go to them.
	const [requests, recommenders, names] = await Promise.all([
		listRequestsAbout(db, about.id),
		listRecommenders(db, about.id),
		nameMap(db)
	]);
	const nameOf = (id: string) => names.get(id) ?? 'Someone';
	const waitingOn = new Set(
		requests
			.filter((r) => r.from_id === identity.acting.id && r.status === 'open')
			.map((r) => r.asked_id)
	);
	const targets = ideaTargets(recommenders, about.id, identity.acting.id);
	return {
		asksThemselves: targets.length === 1 && targets[0] === about.id,
		waitingOnThem: waitingOn.has(about.id),
		targets: targets.map((id) => ({ id, name: nameOf(id), waiting: waitingOn.has(id) })),
		requests,
		names
	};
}

/** The `ask` form action: sends the requests and says who was asked. */
export async function sendAsk(
	db: D1Database,
	identity: App.Identity,
	about: PublicPerson,
	form: FormData
) {
	const alsoAskThem = form.get('also_ask_them') === 'on';
	const { created, skipped } = await askForIdeas(db, identity.acting.id, about.id, alsoAskThem);
	const names = await nameMap(db);
	const nameOf = (id: string) => names.get(id) ?? 'Someone';
	const parts = [];
	if (created.length) {
		parts.push(`Asked ${listNames(created.map(nameOf))} for ideas about ${about.name}.`);
	}
	if (skipped.length) {
		parts.push(`Still waiting to hear back from ${listNames(skipped.map(nameOf))}.`);
	}
	return { message: parts.join(' ') };
}
