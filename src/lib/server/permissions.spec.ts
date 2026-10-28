import { describe, expect, it } from 'vitest';
import {
	canClaim,
	canEditItem,
	canManagePin,
	canManageRecommenders,
	canSeeSpoilersFor,
	canUnclaim,
	claimantIds,
	hasAdminAccess,
	isLockedFor,
	leavesNoAdmin,
	removalMode,
	visibleIds
} from './permissions.ts';

describe('acting as', () => {
	const sam = { id: 'sam', has_pin: true };
	const mia = { id: 'mia', has_pin: false };

	it('lets anyone act as someone without a PIN', () => {
		expect(isLockedFor('alex', mia, [])).toBe(false);
	});

	it('needs a PIN-protected person’s PIN first', () => {
		expect(isLockedFor('alex', sam, [])).toBe(true);
		expect(isLockedFor('alex', sam, ['sam'])).toBe(false);
	});

	it('never locks you out of yourself', () => {
		expect(isLockedFor('sam', sam, [])).toBe(false);
	});

	it('can release claims made as yourself or as who you are acting as', () => {
		expect(claimantIds('alex', 'alex')).toEqual(['alex']);
		expect(claimantIds('alex', 'mia')).toEqual(['alex', 'mia']);
	});
});

describe('items', () => {
	const own = { owner_id: 'mia', created_by_id: 'mia', status: 'wanted' as const };

	it('owner and creator can edit, others cannot', () => {
		expect(canEditItem('mia', own)).toBe(true);
		expect(canEditItem('sam', { ...own, created_by_id: 'sam' })).toBe(true);
		expect(canEditItem('june', own)).toBe(false);
	});

	it('archived items are read-only', () => {
		expect(canEditItem('mia', { ...own, status: 'archived' })).toBe(false);
	});

	it('claimed items are archived, never deleted', () => {
		expect(removalMode({ status: 'wanted', claimed_at: null })).toBe('delete');
		expect(removalMode({ status: 'claimed', claimed_at: '2026-01-01' })).toBe('archive');
	});
});

describe('claiming', () => {
	const wanted = {
		owner_id: 'mia',
		status: 'wanted' as const,
		claimed_by_id: null,
		entered_by_id: null
	};
	const claimed = {
		...wanted,
		status: 'claimed' as const,
		claimed_by_id: 'june',
		entered_by_id: 'alex'
	};

	it('owners cannot claim from their own list', () => {
		expect(canClaim('mia', wanted)).toBe(false);
	});

	it('only wanted items can be claimed', () => {
		expect(canClaim('sam', wanted)).toBe(true);
		expect(canClaim('sam', claimed)).toBe(false);
	});

	it('the giver or the person who entered the claim can release it', () => {
		expect(canUnclaim('june', ['june'], claimed)).toBe(true);
		expect(canUnclaim('alex', ['alex'], claimed)).toBe(true);
		expect(canUnclaim('sam', ['sam'], claimed)).toBe(false);
	});

	it('a parent can release a claim made while acting for someone they manage', () => {
		expect(canUnclaim('alex', ['alex', 'june'], { ...claimed, entered_by_id: 'june' })).toBe(true);
	});
});

describe('people', () => {
	it('history and idea requests are hidden from the person they are about', () => {
		expect(canSeeSpoilersFor('mia', 'mia')).toBe(false);
		expect(canSeeSpoilersFor('alex', 'mia')).toBe(true);
	});

	it('only the person (or someone acting as them) chooses their recommenders', () => {
		expect(canManageRecommenders('mia', 'mia')).toBe(true);
		expect(canManageRecommenders('alex', 'mia')).toBe(false);
	});

	it('only the person themselves can change their PIN', () => {
		expect(canManagePin('sam', 'sam')).toBe(true);
		expect(canManagePin('alex', 'sam')).toBe(false);
	});
});

describe('admin', () => {
	it('needs both the admin flag and a personal PIN', () => {
		expect(hasAdminAccess({ is_admin: true, has_pin: true })).toBe(true);
		expect(hasAdminAccess({ is_admin: true, has_pin: false })).toBe(false);
		expect(hasAdminAccess({ is_admin: false, has_pin: true })).toBe(false);
	});

	const family = [
		{ id: 'alex', is_admin: true, has_pin: true },
		{ id: 'sam', is_admin: true, has_pin: false },
		{ id: 'mia', is_admin: false, has_pin: false }
	];

	it('refuses to demote or remove the last usable admin', () => {
		expect(leavesNoAdmin(family, { personId: 'alex', isAdmin: false })).toBe(true);
		expect(leavesNoAdmin(family, { personId: 'alex', removed: true })).toBe(true);
		expect(leavesNoAdmin(family, { personId: 'alex', hasPin: false })).toBe(true);
	});

	it('allows changes while another admin with a PIN remains', () => {
		const twoAdmins = [...family, { id: 'june', is_admin: true, has_pin: true }];
		expect(leavesNoAdmin(twoAdmins, { personId: 'alex', isAdmin: false })).toBe(false);
		expect(leavesNoAdmin(family, { personId: 'mia', removed: true })).toBe(false);
		expect(leavesNoAdmin(family, { personId: 'sam', isAdmin: false })).toBe(false);
	});

	it('counts a promotion as a usable admin only once they have a PIN', () => {
		const none = family.map((p) => ({ ...p, is_admin: false }));
		expect(leavesNoAdmin(none, { personId: 'mia', isAdmin: true })).toBe(true);
		expect(leavesNoAdmin(none, { personId: 'alex', isAdmin: true })).toBe(false);
	});
});

describe('groups', () => {
	const memberships = [
		{ person_id: 'mia', group_id: 'mums' },
		{ person_id: 'sam', group_id: 'mums' },
		{ person_id: 'sam', group_id: 'dads' },
		{ person_id: 'leo', group_id: 'dads' }
	];
	const sees = (id: string) => [...visibleIds(id, memberships)].sort();

	it('shows people who share a group', () => {
		expect(sees('mia')).toEqual(['mia', 'sam']);
	});

	it('shows members of every group someone is in', () => {
		expect(sees('sam')).toEqual(['leo', 'mia', 'sam']);
	});

	it('shows someone in no group only themselves', () => {
		expect(sees('june')).toEqual(['june']);
	});
});
