import { describe, expect, it } from 'vitest';
import { ideaTargets, parseIdeas } from './ideas.ts';

describe('who is asked for ideas', () => {
	it('asks all of the person’s recommenders', () => {
		expect(ideaTargets(['sam', 'june'], 'mia', 'alex')).toEqual(['sam', 'june']);
	});

	it('never asks the person asking', () => {
		expect(ideaTargets(['sam', 'alex'], 'mia', 'alex')).toEqual(['sam']);
	});

	it('asks the person themselves when they have no other recommenders', () => {
		expect(ideaTargets([], 'mia', 'alex')).toEqual(['mia']);
		expect(ideaTargets(['alex'], 'mia', 'alex')).toEqual(['mia']);
	});

	it('also asks the person themselves when asked to', () => {
		expect(ideaTargets(['sam', 'june'], 'mia', 'alex', true)).toEqual(['sam', 'june', 'mia']);
		expect(ideaTargets([], 'mia', 'alex', true)).toEqual(['mia']);
	});
});

describe('reading ideas from a message', () => {
	it('uses a plain line as the name', () => {
		expect(parseIdeas('Dinosaur puzzle')).toEqual([
			{ title: 'Dinosaur puzzle', url: null, notes: null, evergreen: false }
		]);
	});

	it('reads a link, notes and "always" from anywhere on the line', () => {
		expect(parseIdeas('Fancy shampoo always https://example.com/s - the Aesop one')).toEqual([
			{
				title: 'Fancy shampoo',
				url: 'https://example.com/s',
				notes: 'the Aesop one',
				evergreen: true
			}
		]);
		expect(parseIdeas('always: chocolates - dark, 70% www.choc.example.')).toEqual([
			{
				title: 'chocolates',
				url: 'https://www.choc.example',
				notes: 'dark, 70%',
				evergreen: true
			}
		]);
	});

	it('only treats "always" at the start or end as evergreen', () => {
		const [idea] = parseIdeas('Paint set - she has always wanted one');
		expect(idea).toMatchObject({ title: 'Paint set', evergreen: false });
	});

	it('reads one idea per line, skipping list markers and blank lines', () => {
		const ideas = parseIdeas('1. Lego\n\n- Socks always\n* https://www.books.example/x');
		expect(ideas.map((i) => [i.title, i.evergreen])).toEqual([
			['Lego', false],
			['Socks', true],
			['books.example', false]
		]);
	});

	it('keeps hyphens inside names', () => {
		expect(parseIdeas('T-shirt - size 8')[0]).toMatchObject({ title: 'T-shirt', notes: 'size 8' });
	});

	it('credits whoever suggested it', () => {
		expect(parseIdeas('Lego - orchid one\nSocks', 'Sam').map((i) => i.notes)).toEqual([
			'orchid one (suggested by Sam)',
			'Suggested by Sam'
		]);
	});

	it('shortens very long names and caps the number of ideas', () => {
		expect(parseIdeas('a'.repeat(300))[0].title).toHaveLength(200);
		expect(parseIdeas(Array(30).fill('x').join('\n'))).toHaveLength(20);
	});
});
