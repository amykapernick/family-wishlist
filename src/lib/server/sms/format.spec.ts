import { describe, expect, it } from 'vitest';
import {
	COMMANDS,
	help,
	HELP,
	helpTopic,
	ownList,
	segments,
	shortDate,
	sizesList,
	sizesSaved,
	theirList
} from './format.ts';

describe('SMS segments', () => {
	it('fits 160 GSM-7 characters in one segment', () => {
		expect(segments('a'.repeat(160))).toEqual({ encoding: 'GSM-7', length: 160, segments: 1 });
		expect(segments('a'.repeat(161)).segments).toBe(2);
	});

	it('counts extension characters twice', () => {
		expect(segments('€').length).toBe(2);
	});

	it('drops to 70 characters per segment for anything outside GSM-7', () => {
		expect(segments('Mia’s list').encoding).toBe('UCS-2');
		expect(segments('🎁'.repeat(36)).segments).toBe(2);
	});
});

describe('SMS formats', () => {
	it('never show claims on your own list', () => {
		const text = ownList([{ title: 'Socks', claimedBy: 'June' }]);
		expect(text).not.toMatch(/June|claimed/i);
	});

	it('number items and show claims on other lists', () => {
		const text = theirList('Mia', [{ title: 'Lego' }, { title: 'Paints', claimedBy: 'June' }]);
		expect(text).toContain('1. Lego');
		expect(text).toContain('2. Paints - claimed by June');
	});

	it('count other people’s claims when they are left out', () => {
		const text = theirList('Mia', [{ title: 'Lego' }], 2, 'list mia');
		expect(text).toContain("2 more are claimed by others. Reply 'list mia all' to see them.");
		expect(theirList('Mia', [], 1)).toBe(
			"Nothing left to claim on Mia's list. 1 more is claimed by others. Reply 'list mia all' to see it."
		);
	});

	it('keeps every reply format in GSM-7', () => {
		const samples = [HELP, ownList([{ title: 'Socks' }]), theirList('Mia', [{ title: 'Lego' }])];
		for (const text of samples) expect(segments(text).encoding).toBe('GSM-7');
		expect(COMMANDS.length).toBeGreaterThan(5);
	});
});

describe('help', () => {
	const topics = [null, 'list', 'add', 'claim', 'ask', 'sizes', 'web'] as const;

	it('stays in GSM-7, with the examples using a family member’s name', () => {
		for (const topic of topics) {
			const text = help(topic, 'Mia');
			expect(segments(text).encoding).toBe('GSM-7');
			if (topic !== 'web' && topic !== 'add') expect(text).toMatch(/mia/i);
		}
		expect(help(null, 'Mia')).toContain("Text '<command> help' for more");
	});

	it('shows adding several items with links and notes', () => {
		const text = help('add', 'Mia');
		expect(text).toContain('add Hiking boots - size 9');
		expect(text).toMatch(/https:\/\//);
		expect(text).toContain('always ');
	});

	it('knows other words for each topic', () => {
		expect(helpTopic('size')).toBe('sizes');
		expect(helpTopic('LINK')).toBe('web');
		expect(helpTopic('reply')).toBe('ask');
		expect(helpTopic('banana')).toBeNull();
		expect(helpTopic(null)).toBeNull();
	});
});

describe('sizes', () => {
	const now = new Date('2026-10-20T00:00:00Z');

	it('dates this year by day, older ones by month and year', () => {
		expect(shortDate('2026-10-03 09:00:00', now)).toBe('3 Oct');
		expect(shortDate('2025-08-01', now)).toBe('Aug 2025');
	});

	it('lists sizes with when each was updated', () => {
		const text = sizesList('Mia', [{ item: 'Shoes', size: '13', updated_at: '2026-10-01' }], now);
		expect(text).toBe("Mia's sizes (and when they were updated):\nShoes: 13 (1 Oct)");
		expect(sizesList(null, [], now)).toContain("'size shoes: 9'");
	});

	it('confirms what changed', () => {
		expect(sizesSaved([{ item: 'Shoes', size: '9' }], ['Hat'], ['Belt'])).toBe(
			"Saved Shoes: 9. Removed Hat. You didn't have a size for Belt."
		);
	});
});
