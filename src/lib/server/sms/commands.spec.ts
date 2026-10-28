import { describe, expect, it } from 'vitest';
import {
	matchItems,
	matchPeople,
	looksLikeCommand,
	parseCommand,
	splitClaimFor
} from './commands.ts';

describe('parsing texts', () => {
	it('claims by number or by name', () => {
		expect(parseCommand('claim 2')).toEqual({ kind: 'claim', n: 2 });
		expect(parseCommand('Claim  exercise shorts ')).toEqual({
			kind: 'claimByName',
			query: 'exercise shorts'
		});
	});

	it('asks for help, about everything or one command', () => {
		expect(parseCommand('Help')).toEqual({ kind: 'help', topic: null });
		expect(parseCommand('?')).toEqual({ kind: 'help', topic: null });
		expect(parseCommand('add help')).toEqual({ kind: 'help', topic: 'add' });
		expect(parseCommand('help Claim')).toEqual({ kind: 'help', topic: 'claim' });
		expect(parseCommand('SIZE  help')).toEqual({ kind: 'help', topic: 'size' });
		// Only a single word before "help": an item can still mention it.
		expect(parseCommand('add Board game help')).toEqual({ kind: 'add', text: 'Board game help' });
	});

	it('texts the website link with "web"', () => {
		expect(parseCommand('Web ')).toEqual({ kind: 'web' });
		expect(parseCommand('link').kind).toBe('unknown');
		// …but not mistaken for a gift idea.
		expect(looksLikeCommand('link')).toBe(true);
	});

	it('has no "done" command any more', () => {
		expect(parseCommand('done 1').kind).toBe('unknown');
	});

	it('lists someone’s list, optionally with everyone’s claims', () => {
		expect(parseCommand('list mia')).toEqual({ kind: 'listOf', name: 'mia', all: false });
		expect(parseCommand('List Grandma June ALL')).toEqual({
			kind: 'listOf',
			name: 'Grandma June',
			all: true
		});
	});

	it('reads and changes sizes', () => {
		expect(parseCommand('sizes')).toEqual({ kind: 'sizes' });
		expect(parseCommand('Sizes for Mia')).toEqual({ kind: 'sizesOf', name: 'Mia' });
		expect(parseCommand('sizes grandma june')).toEqual({ kind: 'sizesOf', name: 'grandma june' });
		expect(parseCommand('size shoes: 9\nhat: remove')).toEqual({
			kind: 'setSizes',
			text: 'shoes: 9\nhat: remove'
		});
	});

	it('asks about a person', () => {
		expect(parseCommand('ask about mia')).toEqual({ kind: 'ask', about: 'mia' });
		expect(parseCommand('ask mia')).toEqual({ kind: 'ask', about: 'mia' });
	});

	it('treats anything else as free text', () => {
		expect(parseCommand('She loves dinosaurs')).toEqual({
			kind: 'unknown',
			text: 'She loves dinosaurs'
		});
	});
});

describe('telling mistyped commands from answers', () => {
	it('flags texts that start with a command word', () => {
		expect(looksLikeCommand('done 1')).toBe(true);
		expect(looksLikeCommand('Claim')).toBe(true);
		expect(looksLikeCommand('Dinosaur puzzle')).toBe(false);
	});
});

describe('matching items by name', () => {
	const items = [{ title: 'New exercise shorts' }, { title: 'Denim shorts' }, { title: 'Shorts' }];

	it('matches a unique part of a name, ignoring case', () => {
		expect(matchItems(items, 'Exercise  SHORTS')).toEqual([items[0]]);
	});

	it('prefers an exact title', () => {
		expect(matchItems(items, 'shorts')).toEqual([items[2]]);
	});

	it('returns every match when the name is ambiguous', () => {
		expect(matchItems(items.slice(0, 2), 'shorts')).toEqual(items.slice(0, 2));
	});
});

describe('claiming for someone', () => {
	const people = [{ name: 'Grandma June' }, { name: 'Mia' }, { name: 'Mark' }];

	it('splits off whose list it is', () => {
		expect(splitClaimFor('lego for mia', people)).toEqual({
			item: 'lego',
			name: 'mia',
			matches: [people[1]]
		});
	});

	it('copes with "for" inside the item name', () => {
		expect(splitClaimFor('photo frame for the grandkids for june', people)).toMatchObject({
			item: 'photo frame for the grandkids',
			matches: [people[0]]
		});
	});

	it('is null when no split names anyone', () => {
		expect(splitClaimFor('photo frame for the grandkids', people)).toBeNull();
		expect(splitClaimFor('lego', people)).toBeNull();
	});

	it('returns every match when the name is ambiguous', () => {
		expect(splitClaimFor('socks for m', people)?.matches).toHaveLength(2);
	});
});

describe('matching people by name', () => {
	const people = [{ name: 'Grandma June' }, { name: 'Mia' }, { name: 'Mark' }];

	it('matches the start of any word', () => {
		expect(matchPeople(people, 'june')).toEqual([people[0]]);
	});

	it('returns every match when it is ambiguous', () => {
		expect(matchPeople(people, 'm')).toHaveLength(2);
	});
});
