import { describe, expect, it } from 'vitest';
import type { ItemRow } from '#lib/types.ts';
import { viewWishlist, wishlistCount } from './spoilers.ts';

const SPOILER_FIELDS = [
	'claimed_by_id',
	'entered_by_id',
	'claimed_at',
	'recent_claims',
	'can_claim'
];

function item(overrides: Partial<ItemRow>): ItemRow {
	return {
		id: 'i',
		owner_id: 'mia',
		title: 'Thing',
		url: null,
		notes: null,
		status: 'wanted',
		evergreen: 0,
		claimed_by_id: null,
		entered_by_id: null,
		occasion: null,
		claimed_at: null,
		created_by_id: 'mia',
		created_at: '2026-01-01',
		updated_at: '2026-01-01',
		...overrides
	};
}

const items = [
	item({ id: 'wanted' }),
	item({
		id: 'claimed',
		status: 'claimed',
		claimed_by_id: 'june',
		entered_by_id: 'alex',
		claimed_at: '2025-12-25'
	}),
	item({ id: 'evergreen', evergreen: 1 }),
	item({ id: 'archived', status: 'archived' }),
	item({ id: 'removed-after-claim', status: 'archived', claimed_by_id: 'june' }),
	item({ id: 'someone-else', owner_id: 'leo' })
];

describe('owner view (acting as the list owner)', () => {
	const view = viewWishlist('mia', ['mia'], 'mia', items);

	it('shows claimed items as plain wanted items', () => {
		expect(view.map((v) => v.id)).toEqual(['wanted', 'claimed', 'evergreen']);
		expect(view.every((v) => v.status === 'wanted')).toBe(true);
	});

	it('strips every spoiler field from the response, not just the UI', () => {
		for (const v of view) {
			for (const field of SPOILER_FIELDS) expect(v).not.toHaveProperty(field);
		}
		expect(JSON.stringify(view)).not.toMatch(/june|alex|2025-12-25/);
	});

	it('never includes evergreen claims, even if they are passed in', () => {
		const claims = [
			{
				id: 'c',
				item_id: 'evergreen',
				claimed_by_id: 'june',
				entered_by_id: 'june',
				created_at: '2026-01-01'
			}
		];
		const withClaims = viewWishlist('mia', ['mia'], 'mia', items, claims);
		expect(JSON.stringify(withClaims)).not.toMatch(/june|2026-01-01/);
	});

	it('hides archived items and other people’s items', () => {
		expect(view.map((v) => v.id)).not.toContain('archived');
		expect(view.map((v) => v.id)).not.toContain('someone-else');
	});

	it('lets the owner edit and remove everything on their list', () => {
		expect(view.every((v) => v.can_edit && v.can_delete)).toBe(true);
	});
});

describe('giver view (acting as someone else)', () => {
	const view = viewWishlist('sam', ['sam'], 'mia', items);

	it('shows claim status and who claimed it', () => {
		const claimed = view.find((v) => v.id === 'claimed');
		expect(claimed).toMatchObject({
			status: 'claimed',
			claimed_by_id: 'june',
			entered_by_id: 'alex'
		});
	});

	it('leaves removed items to the history page', () => {
		expect(view.map((v) => v.id)).not.toContain('removed-after-claim');
		expect(view.map((v) => v.id)).not.toContain('archived');
	});

	it('only offers claim on wanted items', () => {
		expect(view.filter((v) => 'can_claim' in v && v.can_claim).map((v) => v.id)).toEqual([
			'wanted',
			'evergreen'
		]);
	});

	it('shows recent evergreen claims and stops the same person claiming twice', () => {
		const claims = [
			{
				id: 'c',
				item_id: 'evergreen',
				claimed_by_id: 'sam',
				entered_by_id: 'sam',
				created_at: '2026-01-01'
			}
		];
		const evergreen = viewWishlist('sam', ['sam'], 'mia', items, claims).find(
			(v) => v.id === 'evergreen'
		);
		expect(evergreen).toMatchObject({ evergreen: true, can_claim: false, can_unclaim: true });
		expect(evergreen && 'recent_claims' in evergreen && evergreen.recent_claims).toHaveLength(1);
	});
});

describe('acting as a child', () => {
	it('a parent acting as the child gets the owner view', () => {
		const view = viewWishlist('mia', ['alex', 'mia'], 'mia', items);
		expect(view.every((v) => v.status === 'wanted')).toBe(true);
		expect(view[0]).not.toHaveProperty('claimed_by_id');
	});
});

describe('acting as someone else', () => {
	it('still hides claims on your own list', () => {
		// Signed in as Mia, acting as Sam, looking at Mia's list.
		const view = viewWishlist('sam', ['sam', 'mia'], 'mia', items, [], 'mia');
		expect(view.every((item) => !('claimed_by_id' in item))).toBe(true);
		expect(view.every((item) => item.status === 'wanted')).toBe(true);
	});

	it('keeps your own count from dropping when something is claimed', () => {
		expect(wishlistCount('sam', 'mia', items, 'mia')).toBe(wishlistCount('mia', 'mia', items));
	});
});

describe('wishlistCount', () => {
	it('does not drop for the owner when something is claimed', () => {
		expect(wishlistCount('mia', 'mia', items)).toBe(3);
	});

	it('counts only unclaimed items for everyone else', () => {
		expect(wishlistCount('sam', 'mia', items)).toBe(2);
	});
});
