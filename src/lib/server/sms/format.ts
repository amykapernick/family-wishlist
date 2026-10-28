// SMS message formats (SPEC.md "Phase 2: SMS"), used by handle.ts.
// Replies stick to plain ASCII so they stay in the GSM-7 character set
// (160 characters per segment rather than 70).

export interface SmsListItem {
	title: string;
	claimedBy?: string | null;
	/** Evergreen items: how many claims in the last six months. */
	evergreenClaims?: number | null;
}

const times = (n: number) => (n === 1 ? 'once' : `${n}x`);

export const COMMANDS = [
	{
		format: 'list',
		does: 'Shows your own list. Claims are never shown, so it stays a surprise.',
		example: 'list'
	},
	{
		format: 'list <name>',
		does: 'Shows someone else’s list, numbered: what’s still available and what you’ve claimed. Items others have claimed are only counted.',
		example: 'list mia'
	},
	{
		format: 'list <name> all',
		does: 'The whole list, including everything other people have claimed and who claimed it.',
		example: 'list mia all'
	},
	{
		format: 'add <item>',
		does: 'Adds to your own list. One item per line; each can have a link, “ - notes”, and “always” for things that are always wanted.',
		example: 'add Hiking boots - size 9'
	},
	{
		format: 'claim <item>',
		does: 'Claims an item from the last list you were sent, by any part of its name. If that matches more than one item, you’re asked which. The gift is from you, and once it’s claimed it’s done.',
		example: 'claim exercise shorts'
	},
	{
		format: 'claim <item> for <name>',
		does: 'Claims from someone’s list without listing it first. If the name matches more than one item, you’re asked which.',
		example: 'claim lego for mia'
	},
	{
		format: 'claim <n>',
		does: 'Claims item n from the last list you were sent.',
		example: 'claim 1'
	},
	{
		format: 'ask about <name>',
		does: 'Asks all of that person’s recommenders for gift ideas. If they haven’t chosen any, asks the person themselves to add to their list.',
		example: 'ask about mia'
	},
	{
		format: '(reply to an idea request)',
		does: 'Answers your newest idea request. Each line is an idea, read like “add”, added to that person’s list and forwarded to whoever asked.',
		example: 'Dinosaur puzzle - 100 pieces'
	},
	{
		format: 'sizes for <name>',
		does: 'Someone’s sizes, with when each was last updated. Just “sizes” shows yours.',
		example: 'sizes for mia'
	},
	{
		format: 'size <item>: <size>',
		does: 'Adds or changes one of your sizes. One per line; “remove” (or nothing) after the colon removes it.',
		example: 'size shoes: AU 9'
	},
	{ format: 'web', does: 'Texts you a link to the website.', example: 'web' },
	{
		format: 'help',
		does: 'Examples of every command. “<command> help” explains one in more detail, with examples.',
		example: 'add help'
	}
] as const;

export const HELP =
	"Sorry, I didn't understand that. Text 'help' for examples, or try: list, list <name>, add <item>, claim <item>, ask about <name>, sizes, or web.";

/** The topics "<command> help" knows about, and other words for them. */
const HELP_TOPICS: Record<string, HelpTopic> = {
	list: 'list',
	add: 'add',
	claim: 'claim',
	ask: 'ask',
	reply: 'ask',
	answer: 'ask',
	ideas: 'ask',
	size: 'sizes',
	sizes: 'sizes',
	web: 'web',
	link: 'web',
	website: 'web'
};

export type HelpTopic = 'list' | 'add' | 'claim' | 'ask' | 'sizes' | 'web';

export const helpTopic = (word: string | null): HelpTopic | null =>
	(word && HELP_TOPICS[word.toLowerCase()]) || null;

/**
 * "help" (topic null) lists every command with an example; "add help" etc.
 * explains one. `name` is a family member's first name for the examples.
 */
export function help(topic: HelpTopic | null, name: string): string {
	const n = name.toLowerCase();
	switch (topic) {
		case 'list':
			return [
				'list - your own list (claims are hidden, so it stays a surprise)',
				`list ${n} - ${name}'s list, numbered: what's available and what you've claimed`,
				`list ${n} all - everything, including who claimed what`,
				"Then text 'claim 2' to claim item 2."
			].join('\n');
		case 'add':
			return [
				"Add to your list, one item per line. Notes go after ' - ', a link can go anywhere, and 'always' marks something that's always wanted. Eg:",
				'add Hiking boots - size 9, brown',
				'Lego 11505 https://lego.com/11505',
				'always Fancy chocolates - dark'
			].join('\n');
		case 'claim':
			return [
				'claim 2 - item 2 on the last list you were sent',
				'claim shorts - by any part of its name',
				`claim lego for ${n} - from ${name}'s list, without listing it first`,
				"If more than one item matches, I'll ask which. Once it's claimed, it's done."
			].join('\n');
		case 'ask':
			return [
				`ask about ${n} - asks ${name}'s recommenders for gift ideas (or ${name}, if no one is set). Their ideas go on ${name}'s list and are texted to you.`,
				"When you're asked for ideas, just reply with them, one per line, the same as 'add'. Eg:",
				'Dinosaur puzzle - 100 pieces',
				'Rain jacket https://example.com/jacket'
			].join('\n');
		case 'sizes':
			return [
				'sizes - your sizes',
				`sizes for ${n} - ${name}'s sizes, with when each was updated`,
				"Change yours with 'item: size', one per line. 'remove' deletes one. Eg:",
				'size shoes: AU 9',
				'shirt: M',
				'hat: remove'
			].join('\n');
		case 'web':
			return 'web - texts you a link to the website that signs this phone straight in as you.';
		default:
			return [
				'Family Wishlist texts:',
				'list - your list',
				`list ${n} - ${name}'s list`,
				'claim 2 - claim from the last list',
				`claim lego for ${n}`,
				'add Hiking boots - size 9',
				`ask about ${n} - get gift ideas`,
				`sizes for ${n}`,
				'size shoes: AU 9',
				'web - link to the website',
				"Text '<command> help' for more, eg 'add help'."
			].join('\n');
	}
}

export const UNKNOWN_NUMBER =
	"Sorry, this number isn't set up for Family Wishlist. Ask a family admin to add it.";

export function ownList(items: readonly SmsListItem[]): string {
	if (items.length === 0) return "Your list is empty. Reply 'add <item>' to add something.";
	return [
		`Your list (${items.length}):`,
		...items.map((item, i) => `${i + 1}. ${item.title}`),
		"Reply 'add <item>' to add more."
	].join('\n');
}

/**
 * Someone else's list. `hiddenClaims` is how many items others have claimed
 * that were left out; `listCommand` is how to ask for the list again.
 */
export function theirList(
	name: string,
	items: readonly SmsListItem[],
	hiddenClaims = 0,
	listCommand = `list ${name.toLowerCase()}`
): string {
	const hidden = hiddenClaims
		? `${hiddenClaims} more ${hiddenClaims === 1 ? 'is' : 'are'} claimed by others. Reply '${listCommand} all' to see ${hiddenClaims === 1 ? 'it' : 'them'}.`
		: null;
	if (items.length === 0) {
		return [`Nothing left to claim on ${name}'s list.`, hidden].filter(Boolean).join(' ');
	}
	return [
		`${name}'s list:`,
		...items.map(
			(item, i) =>
				`${i + 1}. ${item.title}${
					item.evergreenClaims != null
						? ` - always wanted${item.evergreenClaims ? `, claimed ${times(item.evergreenClaims)} in 6 months` : ''}`
						: item.claimedBy
							? ` - claimed by ${item.claimedBy}`
							: ''
				}`
		),
		hidden,
		"Reply 'claim' and the item's name or number to claim it."
	]
		.filter(Boolean)
		.join('\n');
}

export const claimed = (title: string, name: string) =>
	`Claimed '${title}' for ${name}, from you. Reply 'list ${name.toLowerCase()}' to see the list again.`;

export const claimedEvergreen = (title: string, name: string, count: number) =>
	`Claimed '${title}' for ${name}, from you. It's always wanted, so it stays on the list (claimed ${times(count)} in the last 6 months).`;

export const alreadyClaimedEvergreen = (title: string) =>
	`You've already claimed '${title}' in the last 6 months. It's always wanted, so others can claim it too.`;

export const alreadyClaimed = (title: string, by: string) =>
	`'${title}' is already claimed by ${by}. Reply with another number.`;

export const noSuchItem = (n: number, count: number) =>
	`There's no item ${n} on that list (it has ${count}). Reply 'list <name>' to see it again.`;

export const noRecentList =
	"Send 'list <name>' first, or say whose list it's on: 'claim <item> for <name>'.";

export const cantClaimOwn = "You can't claim from your own list.";

export const noMatchingItemFor = (query: string, name: string) =>
	`Nothing on ${name}'s list matches '${query}'. Reply 'list ${name.toLowerCase()}' to see it.`;

export const noMatchingItem = (query: string) =>
	`Nothing on that list matches '${query}'. Reply 'list <name>' to see it again.`;

export function whichItem(query: string, matches: readonly { n: number; title: string }[]): string {
	return [
		`More than one item matches '${query}':`,
		...matches.map((m) => `${m.n}. ${m.title}`),
		"Reply 'claim' and the number, or more of the name."
	].join('\n');
}

const quoted = (titles: readonly string[]) => {
	const q = titles.map((t) => `'${t}'`);
	return q.length < 2 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q.at(-1)}`;
};

export const added = (titles: readonly string[]) => `Added ${quoted(titles)} to your list.`;

/** "Alex", "Alex and Sam", "Alex, Sam and June" */
const names = (list: readonly string[]) =>
	list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

/** `texted` get a text; `online` have no phone and see the request on the website. */
export function asked(texted: readonly string[], online: readonly string[], about: string): string {
	const all = [...texted, ...online];
	return [
		`Asked ${names(all)} for ideas about ${about}. I'll text you what they say.`,
		online.length ? `${names(online)} will see it on the website.` : ''
	]
		.filter(Boolean)
		.join(' ');
}

export const askedThemselves = (about: string, hasPhone: boolean) =>
	`${about} hasn't chosen any recommenders, so I've asked ${about} to add ideas to their list${hasPhone ? '' : ' on the website'}.`;

const IDEA_FORMAT =
	"One per line. Add a link, ' - ' then notes, or 'always' if it's always welcome.";

export const ideaRequest = (from: string, about: string) =>
	`${from} is looking for gift ideas for ${about}. Reply with ideas and I'll add them to ${about}'s list. ${IDEA_FORMAT}`;

export const ideaRequestSelf = (from: string) =>
	`${from} is looking for gift ideas for you. Reply with things you'd like and I'll add them to your list. ${IDEA_FORMAT}`;

export const ideaThanks = (from: string, about: string | null, count = 1) =>
	`Thanks! I've added ${count === 1 ? 'that' : `those ${count} ideas`} to ${about ? `${about}'s` : 'your'} list and let ${from} know.`;

export const ideaForwarded = (asked: string, about: string, response: string) =>
	`${asked}'s ideas for ${about}: ${response}`;

export const link = (url: string) => `Family Wishlist: ${url}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Oct" this year, "Oct 2025" otherwise. */
export function shortDate(iso: string, now = new Date()): string {
	const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	const month = MONTHS[date.getUTCMonth()];
	return date.getUTCFullYear() === now.getUTCFullYear()
		? `${date.getUTCDate()} ${month}`
		: `${month} ${date.getUTCFullYear()}`;
}

/** `name` is null for your own sizes. */
export function sizesList(
	name: string | null,
	sizes: readonly { item: string; size: string; updated_at: string }[],
	now = new Date()
): string {
	if (sizes.length === 0) {
		return name
			? `${name} hasn't added any sizes yet.`
			: "You haven't added any sizes. Reply 'size shoes: 9' to add one (one per line).";
	}
	return [
		`${name ? `${name}'s` : 'Your'} sizes (and when they were updated):`,
		...sizes.map((s) => `${s.item}: ${s.size} (${shortDate(s.updated_at, now)})`),
		name ? null : "Reply 'size <item>: <size>' to change one, or 'size <item>: remove'."
	]
		.filter(Boolean)
		.join('\n');
}

export function sizesSaved(
	saved: readonly { item: string; size: string }[],
	removed: readonly string[],
	missing: readonly string[]
): string {
	return [
		saved.length ? `Saved ${saved.map((s) => `${s.item}: ${s.size}`).join(', ')}.` : null,
		removed.length ? `Removed ${removed.join(', ')}.` : null,
		missing.length ? `You didn't have a size for ${missing.join(', ')}.` : null
	]
		.filter(Boolean)
		.join(' ');
}

export const sizesHelp =
	"To change your sizes, reply 'size <item>: <size>', one per line, like 'size shoes: 9'. To see someone's, reply 'sizes for <name>'.";

export const noSuchPerson = (name: string) =>
	`There's no one called '${name}' in the family. Check the spelling and try again.`;

export const whichPerson = (name: string, matches: readonly string[]) =>
	`'${name}' could be ${matches.join(' or ')}. Use more of their name.`;

export const cantAsk =
	"You can't ask for ideas about yourself. Reply 'add <item>' to add to your own list.";

export const alreadyAsked = (about: string) =>
	`You've already asked about ${about}. I'll text you when people reply.`;

export const ownItem = (title: string) => `'${title}' is on your own list, so you can't claim it.`;

export const alreadyYours = (title: string) => `You've already claimed '${title}'.`;

export const itemGone =
	"That item isn't on the list any more. Reply 'list <name>' to see it again.";

// GSM 03.38 basic character set (plus the extension table, which costs two
// characters each). Anything else forces UCS-2 encoding.
const GSM_BASIC =
	'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';

/** How Twilio will bill a message: encoding, length in that encoding, and segments. */
export function segments(text: string) {
	const chars = [...text];
	const gsm = chars.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c));
	if (gsm) {
		const length = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
		return {
			encoding: 'GSM-7' as const,
			length,
			segments: length <= 160 ? 1 : Math.ceil(length / 153)
		};
	}
	const length = text.length; // UTF-16 code units
	return {
		encoding: 'UCS-2' as const,
		length,
		segments: length <= 70 ? 1 : Math.ceil(length / 67)
	};
}
