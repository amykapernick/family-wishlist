// Parsing for the strict SMS commands (SPEC.md "Phase 2: SMS").
// Pure functions, so the rules can be tested without a database.

export type Command =
	| { kind: 'list' }
	| { kind: 'listOf'; name: string; all: boolean }
	| { kind: 'add'; text: string }
	| { kind: 'claim'; n: number }
	| { kind: 'claimByName'; query: string }
	| { kind: 'ask'; about: string }
	| { kind: 'web' }
	| { kind: 'help'; topic: string | null }
	| { kind: 'sizes' }
	| { kind: 'sizesOf'; name: string }
	| { kind: 'setSizes'; text: string }
	| { kind: 'unknown'; text: string };

export function parseCommand(raw: string): Command {
	// Commands are one line; `add` and free text keep their lines (one idea each).
	const full = raw.trim();
	const text = full.replace(/\s+/g, ' ');
	const lower = text.toLowerCase();
	if (lower === 'list') return { kind: 'list' };
	if (lower === 'web') return { kind: 'web' };

	// "help", "?", "help add" or "add help". Before the others, so "add help"
	// isn't added to your list.
	let match = /^(?:help|\?)(?: (\S+))?$/i.exec(text) ?? /^(\S+) help$/i.exec(text);
	if (match) return { kind: 'help', topic: match[1]?.toLowerCase() ?? null };

	// "sizes" / "sizes for mia" read sizes; "size shoes: 9" (one per line) changes your own.
	if (/^sizes?$/i.test(text)) return { kind: 'sizes' };
	match = /^sizes?\s+([\s\S]+)$/i.exec(full);
	if (match) {
		const rest = match[1];
		if (rest.includes(':')) return { kind: 'setSizes', text: rest };
		return { kind: 'sizesOf', name: rest.replace(/\s+/g, ' ').replace(/^for /i, '').trim() };
	}

	// "list mia all" also shows what other people have claimed.
	match = /^list (.+?)( all)?$/i.exec(text);
	if (match) return { kind: 'listOf', name: match[1], all: !!match[2] };

	match = /^add\s+([\s\S]+)$/i.exec(full);
	if (match) return { kind: 'add', text: match[1] };

	match = /^claim #?(\d{1,3})$/i.exec(text);
	if (match) return { kind: 'claim', n: Number(match[1]) };

	match = /^claim (.+)$/i.exec(text);
	if (match) return { kind: 'claimByName', query: match[1] };

	match = /^ask (?:about )?(.+)$/i.exec(text);
	if (match) return { kind: 'ask', about: match[1] };

	return { kind: 'unknown', text: full };
}

// Includes old command names ("done", "link"), so they get the help reply
// rather than being taken as gift ideas.
const COMMAND_WORDS = [
	'list',
	'add',
	'claim',
	'done',
	'ask',
	'web',
	'link',
	'help',
	'size',
	'sizes'
];

/** Starts with a command word, so it's a mistake rather than an answer to an idea request. */
export function looksLikeCommand(text: string): boolean {
	const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
	return COMMAND_WORDS.includes(first);
}

/**
 * Finds family members by name: an exact full name wins, otherwise anyone
 * whose name, or any word of it, starts with what was typed.
 */
export function matchPeople<P extends { name: string }>(people: readonly P[], typed: string): P[] {
	const query = typed.trim().toLowerCase();
	if (!query) return [];
	const exact = people.filter((p) => p.name.toLowerCase() === query);
	if (exact.length > 0) return exact;
	return people.filter((p) => {
		const name = p.name.toLowerCase();
		return name.startsWith(query) || name.split(' ').some((word) => word.startsWith(query));
	});
}

/**
 * Finds list items by name: an exact title wins, otherwise every title that
 * contains what was typed (ignoring case and extra spaces).
 */
export function matchItems<I extends { title: string }>(items: readonly I[], typed: string): I[] {
	const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
	const query = normalise(typed);
	if (!query) return [];
	const exact = items.filter((item) => normalise(item.title) === query);
	if (exact.length > 0) return exact;
	return items.filter((item) => normalise(item.title).includes(query));
}

/**
 * "claim <item> for <name>": splits at the last " for " whose right-hand side
 * names someone, so titles containing "for" still work ("photo frame for the
 * grandkids for june"). Null if no split names anyone.
 */
export function splitClaimFor<P extends { name: string }>(
	query: string,
	people: readonly P[]
): { item: string; name: string; matches: P[] } | null {
	const lower = query.toLowerCase();
	for (let i = lower.lastIndexOf(' for '); i > 0; i = lower.lastIndexOf(' for ', i - 1)) {
		const item = query.slice(0, i).trim();
		const name = query.slice(i + 5).trim();
		const matches = matchPeople(people, name);
		if (item && matches.length > 0) return { item, name, matches };
	}
	return null;
}

/** The last numbered list sent to a phone, so `claim 2` knows which item 2 is. */
export interface SmsContext {
	ownerId: string;
	itemIds: string[];
	at: number;
}

export const CONTEXT_TTL = 30 * 60 * 1000;

export function isContextFresh(context: SmsContext | null | undefined, now = Date.now()) {
	return !!context && now - context.at < CONTEXT_TTL;
}
