// Idea requests: who gets asked, and how an answer becomes a list item.

import type { ItemFields } from './db.ts';

/**
 * Asking about someone goes to all of their recommenders (never the person
 * asking). If that leaves no one, or `alsoAskThem` is set, the person
 * themselves is asked too, so they can add to their own list.
 */
export function ideaTargets(
	recommenderIds: readonly string[],
	aboutId: string,
	askerId: string,
	alsoAskThem = false
): string[] {
	const targets = [...new Set(recommenderIds)].filter((id) => id !== askerId && id !== aboutId);
	return targets.length === 0 || alsoAskThem ? [...targets, aboutId] : targets;
}

export const MAX_IDEAS = 20;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>]+/i;
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
const ALWAYS = /^[([]?always[)\].,!:]?$/i;

/**
 * One idea per line:
 *   Dinosaur puzzle - the 100 piece one
 *   Fancy shampoo always https://example.com/shampoo
 * - name: everything before " - " (or the whole line)
 * - link: any http(s):// or www. address, wherever it is
 * - notes: everything after " - "
 * - evergreen: "always" as the first or last word of the name or notes
 * List markers ("1.", "-", "*") at the start of a line are ignored.
 */
export function parseIdea(
	line: string
): (Omit<ItemFields, 'notes'> & { notes: string | null }) | null {
	let text = line.replace(LIST_MARKER, '').trim();
	let url: string | null = null;
	const link = URL_PATTERN.exec(text);
	if (link) {
		url = link[0].replace(/[.,;:!?)\]]+$/, '');
		if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
		text = `${text.slice(0, link.index)} ${text.slice(link.index + link[0].length)}`;
	}
	text = text.replace(/\s+/g, ' ').trim();

	const dash = /\s[-–—]\s/.exec(` ${text} `);
	const [rawTitle, rawNotes] = dash
		? [` ${text} `.slice(0, dash.index), ` ${text} `.slice(dash.index + dash[0].length)]
		: [text, ''];

	let evergreen = false;
	/** Drops "always" from the start or end of a phrase, noting it. */
	const unalways = (phrase: string) => {
		const words = phrase.trim().split(' ').filter(Boolean);
		if (words.length > 1 && ALWAYS.test(words[0])) {
			evergreen = true;
			words.shift();
		} else if (words.length > 0 && ALWAYS.test(words.at(-1)!)) {
			evergreen = true;
			words.pop();
		}
		return words.join(' ').replace(/^[-–—:,\s]+|[-–—:,\s]+$/g, '');
	};
	let title = unalways(rawTitle);
	const notes = unalways(rawNotes) || null;

	if (!title && url) title = new URL(url).hostname.replace(/^www\./, '');
	if (!title) return null;
	if (title.length > 200) title = `${title.slice(0, 197).trimEnd()}...`;
	return { title, url, notes: notes?.slice(0, 2000) ?? null, evergreen };
}

/**
 * Every idea in a message (one per line, up to 20), as items. `suggestedBy`
 * is credited in the notes when someone suggests ideas for another person.
 */
export function parseIdeas(text: string, suggestedBy: string | null = null): ItemFields[] {
	return text
		.split(/\r?\n/)
		.map(parseIdea)
		.filter((idea) => idea !== null)
		.slice(0, MAX_IDEAS)
		.map((idea) => ({
			...idea,
			notes: suggestedBy
				? idea.notes
					? `${idea.notes} (suggested by ${suggestedBy})`
					: `Suggested by ${suggestedBy}`
				: idea.notes
		}));
}
