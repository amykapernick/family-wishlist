import { describe, expect, it } from 'vitest';
import { canEditSizes, parseSizeLines } from './sizes.ts';

describe('reading sizes from a text', () => {
	it('reads one "item: size" per line', () => {
		expect(parseSizeLines('Shoes: AU 9\n  t-shirt :  M ')).toEqual([
			{ item: 'Shoes', size: 'AU 9' },
			{ item: 'T-shirt', size: 'M' }
		]);
	});

	it('keeps colons in the size', () => {
		expect(parseSizeLines('Ring: 7:5')).toEqual([{ item: 'Ring', size: '7:5' }]);
	});

	it('treats an empty size, "-", "none" or "remove" as removing it', () => {
		expect(parseSizeLines('hat:\ngloves: -\nbelt: None\nsocks: remove').map((c) => c.size)).toEqual(
			[null, null, null, null]
		);
	});

	it('ignores lines without an item', () => {
		expect(parseSizeLines('just words\n: 9')).toEqual([]);
	});
});

describe('who can change sizes', () => {
	it('is the person, or whoever is acting as them', () => {
		expect(canEditSizes('mia', 'mia')).toBe(true);
		expect(canEditSizes('alex', 'mia')).toBe(false);
	});
});
