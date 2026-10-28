import type { PageServerLoad } from './$types';
import { listRecentGiftsFrom, nameMap } from '#lib/server/db.ts';
import { requireIdentity } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const db = getEnv().DB;
	// Always the signed-in person's own gifts, never whoever they're acting as.
	const [gifts, names] = await Promise.all([
		listRecentGiftsFrom(db, identity.self.id),
		nameMap(db)
	]);
	// One section per person, most recent gift first. Recipients are named even
	// if they've since moved outside your groups; only visible lists link.
	const recipients = new Map<
		string,
		{ id: string; name: string; canOpen: boolean; gifts: typeof gifts }
	>();
	for (const gift of gifts) {
		const recipient = recipients.get(gift.owner_id) ?? {
			id: gift.owner_id,
			name: names.get(gift.owner_id) ?? 'Someone',
			canOpen: identity.people.some((p) => p.id === gift.owner_id),
			gifts: []
		};
		recipient.gifts.push(gift);
		recipients.set(gift.owner_id, recipient);
	}
	return {
		recipients: [...recipients.values()]
	};
};
