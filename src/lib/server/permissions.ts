// Pure permission rules. Every write route calls these with identities that
// came from signed cookies and the database, never from the request body.

import type { ItemClaimRow, ItemRow, PublicPerson } from '#lib/types.ts';

export interface Actor {
	/** The person this device belongs to ("who are you?"). */
	selfId: string;
	/** Who they are currently acting as: self, or anyone else in the family. */
	actingId: string;
}

/**
 * Anyone can act as anyone in the family. Someone with a personal PIN is
 * locked until their PIN has been entered in this browser session.
 */
export function isLockedFor(
	selfId: string,
	person: Pick<PublicPerson, 'id' | 'has_pin'>,
	unlocked: readonly string[]
): boolean {
	return person.id !== selfId && person.has_pin && !unlocked.includes(person.id);
}

/** Whose claims this browser can release: the person and whoever they're acting as. */
export function claimantIds(selfId: string, actingId: string): string[] {
	return selfId === actingId ? [selfId] : [selfId, actingId];
}

export function isOwner(actingId: string, item: Pick<ItemRow, 'owner_id'>): boolean {
	return item.owner_id === actingId;
}

/** The owner, or whoever added the item, may edit its title, link and notes. */
export function canEditItem(
	actingId: string,
	item: Pick<ItemRow, 'owner_id' | 'created_by_id' | 'status'>
): boolean {
	if (item.status === 'archived') return false;
	return item.owner_id === actingId || item.created_by_id === actingId;
}

/**
 * "Remove" is offered to the same people who can edit. Only unclaimed items
 * are hard-deleted; anything claimed is archived instead (see
 * `removalMode`) so gift history is never lost.
 */
export function canRemoveItem(
	actingId: string,
	item: Pick<ItemRow, 'owner_id' | 'created_by_id' | 'status'>
): boolean {
	return canEditItem(actingId, item);
}

export function removalMode(item: Pick<ItemRow, 'status' | 'claimed_at'>): 'delete' | 'archive' {
	return item.status === 'wanted' && !item.claimed_at ? 'delete' : 'archive';
}

/** Owners can never claim from their own list. */
export function canClaim(actingId: string, item: Pick<ItemRow, 'owner_id' | 'status'>): boolean {
	return !isOwner(actingId, item) && item.status === 'wanted';
}

/**
 * The person who clicked claim, or the named giver, may release a claim.
 * `claimantIds` lets a parent release something they claimed while acting as a child.
 */
export function canUnclaim(
	actingId: string,
	actable: readonly string[],
	item: Pick<ItemRow, 'owner_id' | 'status' | 'claimed_by_id' | 'entered_by_id'>
): boolean {
	if (isOwner(actingId, item) || item.status !== 'claimed') return false;
	return [item.claimed_by_id, item.entered_by_id].some((id) => id !== null && actable.includes(id));
}

/** Like `canUnclaim`, for one claim on an evergreen item. */
export function canReleaseClaim(
	actable: readonly string[],
	claim: Pick<ItemClaimRow, 'claimed_by_id' | 'entered_by_id'>
): boolean {
	return [claim.claimed_by_id, claim.entered_by_id].some(
		(id) => id !== null && actable.includes(id)
	);
}

/**
 * Claims, history and idea requests about a person are hidden from that
 * person: whether they're acting as themselves or as someone else (`selfId`
 * is who's signed in), so switching who you act as can't reveal your own.
 */
export function canSeeSpoilersFor(actingId: string, personId: string, selfId = actingId): boolean {
	return actingId !== personId && selfId !== personId;
}

/**
 * Choosing recommenders (who gets asked for ideas about you) is up to the
 * person, or whoever is acting for them.
 */
export function canManageRecommenders(actingId: string, personId: string): boolean {
	return actingId === personId;
}

/** Setting or clearing a personal PIN requires already being that person. */
export function canManagePin(actingId: string, personId: string): boolean {
	return actingId === personId;
}

/**
 * Admin rights come from who you are (self), not who you are acting as, and
 * only count while you have a personal PIN, so admin access is always behind
 * a PIN check on top of the family link.
 */
export function hasAdminAccess(self: Pick<PublicPerson, 'is_admin' | 'has_pin'>): boolean {
	return self.is_admin && self.has_pin;
}

/** Would this change leave the family with no usable admin? */
export function leavesNoAdmin(
	people: readonly Pick<PublicPerson, 'id' | 'is_admin' | 'has_pin'>[],
	change: { personId: string; isAdmin?: boolean; hasPin?: boolean; removed?: boolean }
): boolean {
	return !people.some((person) => {
		if (person.id !== change.personId) return hasAdminAccess(person);
		if (change.removed) return false;
		return hasAdminAccess({
			is_admin: change.isAdmin ?? person.is_admin,
			has_pin: change.hasPin ?? person.has_pin
		});
	});
}

/**
 * Who `selfId` can see: themselves, plus anyone sharing a group with them.
 * Someone in no group sees only themselves.
 */
export function visibleIds(
	selfId: string,
	memberships: readonly { person_id: string; group_id: string }[]
): Set<string> {
	const mine = new Set(memberships.filter((m) => m.person_id === selfId).map((m) => m.group_id));
	return new Set([
		selfId,
		...memberships.filter((m) => mine.has(m.group_id)).map((m) => m.person_id)
	]);
}
