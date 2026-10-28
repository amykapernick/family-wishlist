import { describe, expect, it } from 'vitest';
import { normalisePhone, parsePeopleLines } from './people.ts';

describe('phone numbers', () => {
	it('strips spacing and needs international format', () => {
		expect(normalisePhone(' +61 (400) 000-001 ')).toBe('+61400000001');
		expect(normalisePhone('')).toBeNull();
		expect(normalisePhone(null)).toBeNull();
		expect(normalisePhone('0400000001')).toBe('invalid');
	});
});

describe('bulk adding people', () => {
	it('reads a name then an optional mobile on each line', () => {
		const lines = parsePeopleLines(
			'Mia +61400000004\n\n  Grandma June  +61 400 000 005\nLeo 2\n- Uncle Bob, +61400000006'
		);
		expect(lines.map((l) => l.person)).toEqual([
			{ name: 'Mia', phone: '+61400000004' },
			{ name: 'Grandma June', phone: '+61400000005' },
			{ name: 'Leo 2', phone: null },
			{ name: 'Uncle Bob', phone: '+61400000006' }
		]);
		expect(lines.map((l) => l.line)).toEqual([1, 3, 4, 5]);
	});

	it('reports each bad line', () => {
		const lines = parsePeopleLines('Mia 0400000004\n+61400000007\nSam +61400000008\nsam', [
			{ name: 'Alex', phone: '+61400000008' }
		]);
		expect(lines.map((l) => l.error)).toEqual([
			'“0400000004” isn’t an international number, like +61400000000.',
			'Needs a name before the number.',
			'Someone already has +61400000008.',
			undefined
		]);
		expect(lines[3].person).toEqual({ name: 'sam', phone: null });
	});

	it('catches people already in the family or repeated in the list', () => {
		const lines = parsePeopleLines('alex\nMia +61400000004\nmia', [{ name: 'Alex', phone: null }]);
		expect(lines.map((l) => l.error)).toEqual([
			'alex is already in the family.',
			undefined,
			'mia is already in the family.'
		]);
	});
});
