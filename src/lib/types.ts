// Shapes shared between server and pages. Server-only fields (pin_hash,
// phone) never leave the server; see `PublicPerson`.

/** 'given' only exists in old data; migration 0005 archives it. */
export type ItemStatus = 'wanted' | 'claimed' | 'archived';
export type RequestStatus = 'open' | 'answered' | 'closed';

export interface PersonRow {
	id: string;
	name: string;
	phone: string | null;
	pin_hash: string | null;
	is_admin: 0 | 1;
	created_at: string;
}

export interface GroupRow {
	id: string;
	name: string;
}

export interface MembershipRow {
	person_id: string;
	group_id: string;
}

export interface PublicPerson {
	id: string;
	name: string;
	has_pin: boolean;
	is_admin: boolean;
}

export interface ItemRow {
	id: string;
	owner_id: string;
	title: string;
	url: string | null;
	notes: string | null;
	status: ItemStatus;
	/** Stays on the list after a claim; claims live in item_claims. */
	evergreen: 0 | 1;
	claimed_by_id: string | null;
	entered_by_id: string | null;
	/** Only on items given before gifting was removed. */
	occasion: string | null;
	claimed_at: string | null;
	created_by_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface ItemClaimRow {
	id: string;
	item_id: string;
	/** Null once that person has been removed from the family. */
	claimed_by_id: string | null;
	entered_by_id: string | null;
	created_at: string;
}

/** What the wishlist owner may see: no claim, giver or gift details. */
export interface OwnerItemView {
	id: string;
	owner_id: string;
	title: string;
	url: string | null;
	notes: string | null;
	status: 'wanted';
	evergreen: boolean;
	can_edit: boolean;
	can_delete: boolean;
}

/** What everyone else sees. */
export interface GiverItemView extends Omit<OwnerItemView, 'status'> {
	status: ItemStatus;
	claimed_by_id: string | null;
	entered_by_id: string | null;
	/** Evergreen items only: claims in the last six months, newest first. */
	recent_claims: Omit<ItemClaimRow, 'item_id'>[];
	can_claim: boolean;
	can_unclaim: boolean;
}

export type ItemView = OwnerItemView | GiverItemView;

export interface IdeaRequestRow {
	id: string;
	from_id: string;
	about_id: string;
	asked_id: string;
	status: RequestStatus;
	response: string | null;
	created_at: string;
}

export interface SizeRow {
	id: string;
	person_id: string;
	item: string;
	size: string;
	updated_at: string;
}

/** Who "Ask for ideas" about someone will go to, for the confirmation dialog. */
export interface AskTargets {
	/** No recommenders, so the person themselves is asked. */
	asksThemselves: boolean;
	/** The asker already has an open request with the person themselves. */
	waitingOnThem: boolean;
	/** `waiting`: already asked and not answered yet, so they're skipped. */
	targets: { id: string; name: string; waiting: boolean }[];
}
