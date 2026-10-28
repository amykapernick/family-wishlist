// Spoiler stripping. This is the only place items are turned into what a
// page or API response receives, so an owner can never be sent claim, giver
// data for their own list, whatever the UI does.

import type { GiverItemView, ItemClaimRow, ItemRow, ItemView, OwnerItemView } from '#lib/types.ts';
import {
	canClaim,
	canEditItem,
	canReleaseClaim,
	canRemoveItem,
	canUnclaim
} from './permissions.ts';

/**
 * Build the owner's view of one item. Claimed items look exactly like
 * wanted ones (an item vanishing on claim would itself be a spoiler).
 */
export function toOwnerView(actingId: string, item: ItemRow): OwnerItemView {
	return {
		id: item.id,
		owner_id: item.owner_id,
		title: item.title,
		url: item.url,
		notes: item.notes,
		status: 'wanted',
		evergreen: item.evergreen === 1,
		can_edit: canEditItem(actingId, item),
		can_delete: canRemoveItem(actingId, item)
	};
}

/**
 * `claims` are the recent evergreen claims for the list (any items; only this
 * item's are used).
 */
export function toGiverView(
	actingId: string,
	actable: readonly string[],
	item: ItemRow,
	claims: readonly ItemClaimRow[] = []
): GiverItemView {
	if (item.evergreen === 1) {
		const recent = claims
			.filter((c) => c.item_id === item.id)
			.map(({ id, claimed_by_id, entered_by_id, created_at }) => ({
				id,
				claimed_by_id,
				entered_by_id,
				created_at
			}));
		return {
			...toGiverView(actingId, actable, { ...item, evergreen: 0 }),
			evergreen: true,
			recent_claims: recent,
			// Anyone can claim again, unless they already have in the last six months.
			can_claim: canClaim(actingId, item) && !recent.some((c) => c.claimed_by_id === actingId),
			can_unclaim: recent.some((c) => canReleaseClaim(actable, c))
		};
	}
	return {
		id: item.id,
		owner_id: item.owner_id,
		title: item.title,
		url: item.url,
		notes: item.notes,
		status: item.status,
		evergreen: false,
		claimed_by_id: item.claimed_by_id,
		entered_by_id: item.entered_by_id,
		recent_claims: [],
		can_edit: canEditItem(actingId, item),
		can_delete: canRemoveItem(actingId, item),
		can_claim: canClaim(actingId, item),
		can_unclaim: canUnclaim(actingId, actable, item)
	};
}

/**
 * The wishlist as `actingId` may see it.
 * - Owner: archived items are dropped; everything else appears as "wanted".
 * - Others: wanted and claimed items. A claim is the last step, so claimed
 *   items stay (marked as claimed) until the owner removes them; removed
 *   items live on the history page. Evergreen items stay wanted, with their
 *   recent claims from `claims`.
 */
export function viewWishlist(
	actingId: string,
	actable: readonly string[],
	ownerId: string,
	items: readonly ItemRow[],
	claims: readonly ItemClaimRow[] = []
): ItemView[] {
	const own = items.filter((item) => item.owner_id === ownerId);
	if (actingId === ownerId) {
		return own
			.filter((item) => item.status !== 'archived')
			.map((item) => toOwnerView(actingId, item));
	}
	return own
		.filter((item) => item.status === 'wanted' || item.status === 'claimed')
		.map((item) => toGiverView(actingId, actable, item, claims));
}

/** Number shown on the home grid; for your own card it must not drop when something is claimed. */
export function wishlistCount(
	actingId: string,
	ownerId: string,
	items: readonly ItemRow[]
): number {
	const own = items.filter((item) => item.owner_id === ownerId);
	if (actingId === ownerId) return own.filter((item) => item.status !== 'archived').length;
	return own.filter((item) => item.status === 'wanted').length;
}

export function isGiverView(view: ItemView): view is GiverItemView {
	return 'claimed_by_id' in view;
}
