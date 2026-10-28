import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listClaimHistory, listEvergreenHistory, nameMap } from '#lib/server/db.ts';
import { findPerson, requireIdentity } from '#lib/server/guard.ts';
import { canSeeSpoilersFor } from '#lib/server/permissions.ts';
import { getEnv } from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const owner = findPerson(identity, event.params.id);
	if (!canSeeSpoilersFor(identity.acting.id, owner.id)) {
		error(403, 'Your own gift history is hidden to keep surprises safe.');
	}
	const showAll = event.url.searchParams.has('all');
	const since = new Date();
	since.setFullYear(since.getFullYear() - 1);
	const db = getEnv().DB;
	const sinceDate = showAll ? null : since.toISOString().slice(0, 10);
	const [rows, evergreen, names] = await Promise.all([
		listClaimHistory(db, owner.id, sinceDate),
		listEvergreenHistory(db, owner.id, sinceDate),
		nameMap(db)
	]);
	// Givers are named even outside your groups. A null giver was removed from
	// the family; the gift stays, without a name.
	const nameOf = (id: string | null) => (id && names.get(id)) ?? 'Someone no longer in the family';
	return {
		owner,
		showAll,
		// Every claim counts as a gift, including each claim on an evergreen item.
		gifts: [
			...rows.map((item) => ({
				id: item.id,
				title: item.title,
				url: item.url,
				from: nameOf(item.claimed_by_id),
				claimedAt: item.claimed_at,
				evergreen: false
			})),
			...evergreen.map((claim) => ({
				id: claim.id,
				title: claim.title,
				url: claim.url,
				from: nameOf(claim.claimed_by_id),
				claimedAt: claim.created_at,
				evergreen: true
			}))
		].sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))
	};
};
