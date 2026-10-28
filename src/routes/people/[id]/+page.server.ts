import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import {
	addEvergreenClaim,
	archiveItem,
	claimItem,
	createItem,
	createItems,
	deleteWantedItem,
	getItem,
	listItemsFor,
	listRecentClaims,
	listSizes,
	removeSize,
	removeSizeById,
	setSize,
	updateSize,
	removeEvergreenClaim,
	unclaimItem,
	updateItem
} from '#lib/server/db.ts';
import {
	claimantIdList,
	findPerson,
	requireIdentity,
	requiredText,
	safeUrl,
	text
} from '#lib/server/guard.ts';
import {
	canClaim,
	canEditItem,
	canReleaseClaim,
	canRemoveItem,
	canUnclaim,
	removalMode
} from '#lib/server/permissions.ts';
import { getEnv } from '#lib/server/session.ts';
import { parseIdeas } from '#lib/server/ideas.ts';
import { canEditSizes, MAX_SIZES_ITEM, MAX_SIZES_SIZE, parseSizeLines } from '#lib/server/sizes.ts';
import { viewWishlist } from '#lib/server/spoilers.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const owner = findPerson(identity, event.params.id);
	const db = getEnv().DB;
	const isOwner = identity.acting.id === owner.id;
	const [rows, claims, sizes] = await Promise.all([
		listItemsFor(db, owner.id),
		// Never loaded for the owner, so it can't leak into their page data.
		isOwner ? [] : listRecentClaims(db, owner.id),
		listSizes(db, owner.id)
	]);
	return {
		owner,
		isOwner,
		items: viewWishlist(identity.acting.id, claimantIdList(identity), owner.id, rows, claims),
		// Names for "claimed by"; never needed (or sent) on the owner's own view.
		people: isOwner ? [] : identity.people.map(({ id, name }) => ({ id, name })),
		actingId: identity.acting.id,
		sizes,
		canEditSizes: canEditSizes(identity.acting.id, owner.id)
	};
};

/** Load the item named in the form and check it belongs to this page's person. */
async function itemFromForm(event: RequestEvent, form: FormData) {
	const item = await getItem(getEnv().DB, String(form.get('item') ?? ''));
	if (!item || item.owner_id !== event.params.id) error(404, 'That item no longer exists.');
	return item;
}

function itemFields(form: FormData) {
	const title = requiredText(form, 'title', 'Title', 200);
	if (title.error) return { error: title.error };
	const url = safeUrl(form, 'url');
	if (url.error) return { error: url.error };
	return {
		fields: {
			title: title.value,
			url: url.value,
			notes: text(form, 'notes', 2000),
			evergreen: form.get('evergreen') === 'on'
		}
	};
}

/** The giver must be a real family member who isn't the list owner. */
function giverFrom(form: FormData, identity: App.Identity, ownerId: string) {
	const giverId = String(form.get('giver') ?? identity.acting.id);
	if (giverId === ownerId || !identity.people.some((p) => p.id === giverId)) return null;
	return giverId;
}

/** Sizes can only be changed by the person, or someone acting as them. */
function sizesGuard(event: RequestEvent) {
	const identity = requireIdentity(event.locals);
	const owner = findPerson(identity, event.params.id);
	if (!canEditSizes(identity.acting.id, owner.id)) {
		error(403, `Switch to acting as ${owner.name} to change their sizes.`);
	}
	return owner;
}

function sizeFields(form: FormData) {
	const item = text(form, 'size_item', MAX_SIZES_ITEM);
	const size = text(form, 'size_value', MAX_SIZES_SIZE);
	if (!item || !size) return null;
	return { item, size };
}

/** "1 size", "3 sizes" */
const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

const isDuplicate = (err: unknown) => String(err).includes('UNIQUE');

export const actions: Actions = {
	addSize: async (event) => {
		const owner = sizesGuard(event);
		const form = await event.request.formData();
		const fields = sizeFields(form);
		if (!fields) {
			return fail(400, {
				sizeForm: 'add',
				sizeError: 'Enter both what it’s for and the size.',
				sizeItem: String(form.get('size_item') ?? ''),
				sizeValue: String(form.get('size_value') ?? '')
			});
		}
		await setSize(getEnv().DB, owner.id, fields.item, fields.size);
		return { message: `Saved ${fields.item}: ${fields.size}.` };
	},

	/** Several "item: size" lines, the same as by text ("hat: remove" removes it). */
	setSizes: async (event) => {
		const owner = sizesGuard(event);
		const text = String((await event.request.formData()).get('sizes') ?? '');
		const changes = parseSizeLines(text);
		if (changes.length === 0) {
			return fail(400, {
				sizeForm: 'bulk',
				sizeBulk: text,
				sizeError: 'Write each size as “item: size”.'
			});
		}
		const db = getEnv().DB;
		let saved = 0;
		let removed = 0;
		for (const change of changes) {
			if (change.size !== null) {
				await setSize(db, owner.id, change.item, change.size);
				saved++;
			} else if (await removeSize(db, owner.id, change.item)) {
				removed++;
			}
		}
		// Short on purpose: the table shows exactly what changed.
		const message =
			saved && removed
				? `Saved ${count(saved, 'size')} and removed ${removed}.`
				: saved
					? `Saved ${count(saved, 'size')}.`
					: removed
						? `Removed ${count(removed, 'size')}.`
						: 'No sizes changed: there was nothing to remove.';
		return { message };
	},

	saveSize: async (event) => {
		const owner = sizesGuard(event);
		const form = await event.request.formData();
		const id = String(form.get('size') ?? '');
		const fields = sizeFields(form);
		if (!fields)
			return fail(400, { sizeId: id, sizeError: 'Enter both what it’s for and the size.' });
		try {
			await updateSize(getEnv().DB, owner.id, id, fields.item, fields.size);
		} catch (err) {
			if (!isDuplicate(err)) throw err;
			return fail(400, { sizeId: id, sizeError: `There’s already a size for ${fields.item}.` });
		}
		return { message: `Saved ${fields.item}: ${fields.size}.` };
	},

	removeSize: async (event) => {
		const owner = sizesGuard(event);
		const form = await event.request.formData();
		await removeSizeById(getEnv().DB, owner.id, String(form.get('size') ?? ''));
		return { message: 'Removed that size.' };
	},

	add: async (event) => {
		const identity = requireIdentity(event.locals);
		const owner = findPerson(identity, event.params.id);
		const form = await event.request.formData();
		const parsed = itemFields(form);
		if (parsed.error) return parsed.error;
		await createItem(getEnv().DB, owner.id, identity.acting.id, parsed.fields);
		return { message: `Added “${parsed.fields.title}”.` };
	},

	/** Several items, one per line, in the same format as adding by text. */
	addMany: async (event) => {
		const identity = requireIdentity(event.locals);
		const owner = findPerson(identity, event.params.id);
		const text = String((await event.request.formData()).get('items') ?? '');
		const ideas = parseIdeas(text);
		if (ideas.length === 0) {
			return fail(400, { field: 'items', message: 'Add at least one item, one per line.', text });
		}
		await createItems(getEnv().DB, owner.id, identity.acting.id, ideas);
		const list = owner.id === identity.acting.id ? 'your wishlist' : `${owner.name}’s wishlist`;
		return { message: `Added ${count(ideas.length, 'item')} to ${list}.` };
	},

	edit: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const item = await itemFromForm(event, form);
		if (!canEditItem(identity.acting.id, item)) error(403, 'You can’t edit this item.');
		const parsed = itemFields(form);
		if (parsed.error) return parsed.error;
		await updateItem(getEnv().DB, item.id, parsed.fields);
		return { message: `Saved “${parsed.fields.title}”.` };
	},

	remove: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const item = await itemFromForm(event, form);
		if (!canRemoveItem(identity.acting.id, item)) error(403, 'You can’t remove this item.');
		const db = getEnv().DB;
		// Deleting only succeeds if it is still unclaimed; otherwise keep it for history.
		if (removalMode(item) === 'delete' && (await deleteWantedItem(db, item.id))) {
			return { message: `Removed “${item.title}”.` };
		}
		await archiveItem(db, item.id);
		return { message: `Removed “${item.title}”.` };
	},

	claim: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const item = await itemFromForm(event, form);
		if (item.owner_id === identity.acting.id) error(403, 'You can’t claim from your own list.');
		if (!canClaim(identity.acting.id, item)) {
			return fail(409, { item: item.id, message: `Someone has already claimed “${item.title}”.` });
		}
		const giverId = giverFrom(form, identity, item.owner_id);
		if (!giverId) return fail(400, { item: item.id, message: 'Choose who the gift is from.' });
		if (item.evergreen) {
			if (!(await addEvergreenClaim(getEnv().DB, item.id, giverId, identity.acting.id))) {
				return fail(409, {
					item: item.id,
					message: `That person already claimed “${item.title}” in the last 6 months.`
				});
			}
			return { message: `Claimed “${item.title}”. It stays on the list for next time.` };
		}
		const ok = await claimItem(getEnv().DB, item.id, giverId, identity.acting.id);
		if (!ok) {
			return fail(409, {
				item: item.id,
				message: `Someone claimed “${item.title}” just before you. Pick something else?`
			});
		}
		return { message: `Claimed “${item.title}”.` };
	},

	unclaim: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const item = await itemFromForm(event, form);
		if (item.evergreen) {
			// Release the newest recent claim this person made or entered.
			const db = getEnv().DB;
			const claim = (await listRecentClaims(db, item.owner_id)).find(
				(c) => c.item_id === item.id && canReleaseClaim(claimantIdList(identity), c)
			);
			if (!claim || item.owner_id === identity.acting.id) {
				error(403, 'Only the person who claimed this can release it.');
			}
			await removeEvergreenClaim(db, claim.id);
			return { message: `Released your claim on “${item.title}”.` };
		}
		if (!canUnclaim(identity.acting.id, claimantIdList(identity), item)) {
			error(403, 'Only the person who claimed this can release it.');
		}
		await unclaimItem(getEnv().DB, item.id);
		return { message: `Released “${item.title}”. It’s available again.` };
	}
};
