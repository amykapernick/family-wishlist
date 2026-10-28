import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { Actions, PageServerLoad } from './$types';
import {
	clearSmsContexts,
	listAllItems,
	listPeople,
	listRecentClaims,
	listRecommenders
} from '#lib/server/db.ts';
import { ideaTargets } from '#lib/server/ideas.ts';
import { requireIdentity, text } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';
import { matchItems } from '#lib/server/sms/commands.ts';
import * as sms from '#lib/server/sms/format.ts';
import { type TraceStep } from '#lib/server/sms/handle.ts';
import { runSms } from '#lib/server/sms/run.ts';
import { toTwiml } from '#lib/server/sms/twilio.ts';
import { isGiverView, viewWishlist } from '#lib/server/spoilers.ts';

// Dev-only preview of how phase 2 SMS will look, built from the real demo
// data so the examples follow the same spoiler rules as the website.

interface Message {
	/** out: sent by the phone's owner. in: sent by the Family Wishlist number. */
	dir: 'out' | 'in';
	text: string;
	segments: ReturnType<typeof sms.segments>;
}

interface Phone {
	owner: string;
	number: string;
	messages: Message[];
}

interface Scenario {
	id: string;
	title: string;
	description: string;
	phones: Phone[];
}

const out = (text: string): Message => ({ dir: 'out', text, segments: sms.segments(text) });
const reply = (text: string): Message => ({ dir: 'in', text, segments: sms.segments(text) });

export const load: PageServerLoad = async (event) => {
	if (!dev) error(404, 'Not found');
	requireIdentity(event.locals);

	const db = getEnv().DB;
	const people = await listPeople(db);
	const items = await listAllItems(db);
	const withPhone = people.filter((p) => p.phone);
	const texter = withPhone[0];
	const phones = withPhone.map((p) => ({ name: p.name, phone: p.phone! }));
	if (!texter) {
		return {
			scenarios: [] as Scenario[],
			commands: sms.COMMANDS,
			phones,
			suggestions: [] as string[],
			options: [] as string[],
			missing: 'Give someone a phone number in Admin to see examples.'
		};
	}
	const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? 'someone';

	// Someone else's list to browse: ideally one with both wanted and claimed
	// items so every example appears, then the longest list.
	const ownedBy = (id: string, status: string) =>
		items.filter((i) => i.owner_id === id && i.status === status).length;
	const score = (id: string) =>
		(ownedBy(id, 'wanted') > 0 && ownedBy(id, 'claimed') > 0 ? 100 : 0) +
		ownedBy(id, 'wanted') +
		ownedBy(id, 'claimed');
	const subject = people
		.filter((p) => p.id !== texter.id)
		.sort((a, b) => score(b.id) - score(a.id))[0];

	const ownView = viewWishlist(texter.id, [texter.id], texter.id, items);
	const subjectView = subject
		? viewWishlist(
				texter.id,
				[texter.id],
				subject.id,
				items,
				await listRecentClaims(db, subject.id)
			).filter((v) => v.status === 'wanted' || v.status === 'claimed')
		: [];
	// The full list ("list mia all"), and the default that leaves out other
	// people's claims, as handleSms() sends them.
	const subjectAll = subjectView.map((v) => ({
		title: v.title,
		evergreenClaims: isGiverView(v) && v.evergreen ? v.recent_claims.length : null,
		claimedBy:
			isGiverView(v) && v.status === 'claimed'
				? v.claimed_by_id === texter.id
					? 'you'
					: nameOf(v.claimed_by_id)
				: null
	}));
	const subjectList = subjectAll.filter((i) => !i.claimedBy || i.claimedBy === 'you');
	const hiddenClaims = subjectAll.length - subjectList.length;
	const phone = (p: { name: string; phone: string | null }, messages: Message[]): Phone => ({
		owner: p.name,
		number: p.phone ?? '',
		messages
	});

	const key = (p: { name: string }) => p.name.split(' ')[0].toLowerCase();
	const scenarios: Scenario[] = [];

	scenarios.push({
		id: 'own-list',
		title: 'Checking your own list',
		description: `${texter.name}'s own list. Anything already claimed shows as a normal item, the same as on the website.`,
		phones: [
			phone(texter, [out('list'), reply(sms.ownList(ownView.map((v) => ({ title: v.title }))))])
		]
	});

	if (subject) {
		const subjectKey = subject.name.split(' ')[0].toLowerCase();
		const messages = [
			out(`list ${subjectKey}`),
			reply(sms.theirList(subject.name, subjectList, hiddenClaims, `list ${subjectKey}`))
		];
		const numbered = subjectList.map((item, i) => ({ ...item, n: i + 1 }));
		const wanted = numbered.filter((i) => !i.claimedBy);

		// A word that matches more than one item, to show the "which one?" reply.
		const words = (title: string) =>
			title
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => w.length > 3);
		const shared = wanted
			.flatMap((i) => words(i.title))
			.find((word) => matchItems(numbered, word).length > 1);
		if (shared) {
			messages.push(
				out(`claim ${shared}`),
				reply(sms.whichItem(shared, matchItems(numbered, shared)))
			);
		}

		// Then the shortest end of a wanted item's name that matches only it.
		const target = (shared && wanted.find((i) => words(i.title).includes(shared))) || wanted[0];
		if (target) {
			const titleWords = target.title.toLowerCase().split(/\s+/);
			const query =
				titleWords
					.map((_, i) => titleWords.slice(i).join(' '))
					.reverse()
					.find((q) => matchItems(numbered, q).length === 1) ?? target.title.toLowerCase();
			messages.push(out(`claim ${query}`), reply(sms.claimed(target.title, subject.name)));
		}

		// Other people's claims only show with "all".
		const allNumbered = subjectAll.map((item, i) => ({ ...item, n: i + 1 }));
		const taken = allNumbered.find((i) => i.claimedBy && i.claimedBy !== 'you');
		if (taken) {
			messages.push(
				out(`list ${subjectKey} all`),
				reply(sms.theirList(subject.name, subjectAll, 0, `list ${subjectKey}`)),
				out(`claim ${taken.n}`),
				reply(sms.alreadyClaimed(taken.title, taken.claimedBy!))
			);
		}
		messages.push(out('claim scooter board'), reply(sms.noMatchingItem('scooter board')));
		scenarios.push({
			id: 'claiming',
			title: `Browsing and claiming from ${subject.name}'s list`,
			description: `Claim by any part of an item’s name, or its number, from the last list sent to that phone (kept for half an hour). Once something is claimed, that’s it: there’s no separate “given” step. The list shows what’s available and what you’ve claimed; “all” adds everyone else’s claims (never shown to ${subject.name}).`,
			phones: [phone(texter, messages)]
		});
	}

	scenarios.push({
		id: 'adding',
		title: 'Adding to your list',
		description:
			'One item per line. A link anywhere becomes the item’s link, text after “ - ” becomes notes, and “always” at the start or end marks it always wanted.',
		phones: [
			phone(texter, [
				out('add Hiking boots - size 9 https://example.com/boots\nFancy socks always'),
				reply(sms.added(['Hiking boots', 'Fancy socks']))
			])
		]
	});

	// Idea requests go to the person's recommenders, or to the person themselves.
	const targetsFor = async (about: (typeof people)[number]) => {
		const ids = ideaTargets(await listRecommenders(db, about.id), about.id, texter.id);
		return people.filter((p) => ids.includes(p.id));
	};
	if (subject) {
		const targets = await targetsFor(subject);
		const texted = targets.filter((t) => t.phone);
		const answerer = texted[0];
		if (targets[0]?.id !== subject.id && answerer) {
			const idea = 'Dinosaur puzzle';
			scenarios.push({
				id: 'ideas',
				title: `Asking for ideas about ${subject.name}`,
				description: `Goes to everyone ${subject.name} picked as a recommender in Settings (${targets.map((t) => t.name).join(', ')}). Anyone with a phone gets a text; everyone sees it on the website. Each answer is added to ${subject.name}’s list and sent to ${texter.name}.`,
				phones: [
					phone(texter, [
						out(`ask about ${key(subject)}`),
						reply(
							sms.asked(
								texted.map((t) => t.name),
								targets.filter((t) => !t.phone).map((t) => t.name),
								subject.name
							)
						),
						reply(sms.ideaForwarded(answerer.name, subject.name, idea))
					]),
					phone(answerer, [
						reply(sms.ideaRequest(texter.name, subject.name)),
						out(idea),
						reply(sms.ideaThanks(texter.name, subject.name))
					])
				]
			});
		}
	}

	// Someone with no recommenders (ideally with a phone) is asked themselves.
	const selfAsked = [];
	for (const p of people.filter((p) => p.id !== texter.id)) {
		const targets = await targetsFor(p);
		if (targets.length === 1 && targets[0].id === p.id) selfAsked.push(p);
	}
	const lonely = selfAsked.find((p) => p.phone) ?? selfAsked[0];
	if (lonely) {
		const idea = 'Noise-cancelling earbuds';
		scenarios.push({
			id: 'no-recommenders',
			title: 'Asking about someone with no recommenders',
			description: `${lonely.name} hasn’t picked any recommenders, so ${lonely.name} is asked to add to their own list.${lonely.phone ? '' : ' They have no phone, so the request waits for them on the website.'}`,
			phones: [
				phone(texter, [
					out(`ask about ${key(lonely)}`),
					reply(sms.askedThemselves(lonely.name, !!lonely.phone)),
					...(lonely.phone ? [reply(sms.ideaForwarded(lonely.name, lonely.name, idea))] : [])
				]),
				...(lonely.phone
					? [
							phone(lonely, [
								reply(sms.ideaRequestSelf(texter.name)),
								out(idea),
								reply(sms.ideaThanks(texter.name, null))
							])
						]
					: [])
			]
		});
	}

	// Evergreen items stay on the list, so several people can claim them.
	const evergreen = items.find(
		(i) => i.evergreen && i.status === 'wanted' && i.owner_id !== texter.id
	);
	const evergreenOwner = evergreen && people.find((p) => p.id === evergreen.owner_id);
	if (evergreen && evergreenOwner) {
		const claims = await listRecentClaims(db, evergreenOwner.id);
		const view = viewWishlist(texter.id, [texter.id], evergreenOwner.id, items, claims).filter(
			(v) => v.status === 'wanted' || v.status === 'claimed'
		);
		const claimedByOthers = (v: (typeof view)[number]) =>
			isGiverView(v) && v.status === 'claimed' && v.claimed_by_id !== texter.id;
		const list = view
			.filter((v) => !claimedByOthers(v))
			.map((v) => ({
				title: v.title,
				evergreenClaims: isGiverView(v) && v.evergreen ? v.recent_claims.length : null,
				claimedBy: isGiverView(v) && v.status === 'claimed' ? 'you' : null
			}));
		const hidden = view.filter(claimedByOthers).length;
		const count = claims.filter((c) => c.item_id === evergreen.id).length;
		const query = evergreen.title.toLowerCase().split(' ').at(-1)!;
		const unique = matchItems(list, query).length === 1 ? query : evergreen.title.toLowerCase();
		scenarios.push({
			id: 'evergreen',
			title: 'Claiming an always-wanted item',
			description: `Always-wanted items (like “${evergreen.title}”) stay on the list after they’re claimed. The list shows how many times each was claimed in the last 6 months, and each person can claim one once in that time.`,
			phones: [
				phone(texter, [
					out(`list ${key(evergreenOwner)}`),
					reply(sms.theirList(evergreenOwner.name, list, hidden, `list ${key(evergreenOwner)}`)),
					out(`claim ${unique}`),
					reply(sms.claimedEvergreen(evergreen.title, evergreenOwner.name, count + 1)),
					out(`claim ${unique}`),
					reply(sms.alreadyClaimedEvergreen(evergreen.title))
				])
			]
		});
	}

	scenarios.push({
		id: 'web',
		title: 'Getting the website link',
		description: 'Sends the family link, which signs the phone’s browser in to the website.',
		phones: [
			phone(texter, [out('web'), reply(sms.link(`${event.url.origin}/join/<FAMILY_TOKEN>`))])
		]
	});

	scenarios.push({
		id: 'errors',
		title: 'When something isn’t right',
		description:
			'Commands are strict for now (no free-text parsing). Anything unrecognised gets the list of commands back.',
		phones: [
			phone(texter, [
				out('claim 1'),
				reply(sms.noRecentList),
				out('what should I get mia?'),
				reply(sms.HELP)
			]),
			{
				owner: 'Unknown number',
				number: '+61499999999',
				messages: [out('list'), reply(sms.UNKNOWN_NUMBER)]
			}
		]
	});

	// A word from something available on the subject's list, for "claim x for y".
	const subjectWord = subjectList
		.find((i) => !i.claimedBy)
		?.title.toLowerCase()
		.split(/\s+/)
		.find((w) => w.length > 3);
	const suggestions = [
		'list',
		subject && `list ${key(subject)}`,
		'claim 1',
		'claim shorts',
		subjectWord && subject && `claim ${subjectWord} for ${key(subject)}`,
		'add Hiking boots',
		subject && `ask about ${key(subject)}`,
		subject && `sizes for ${key(subject)}`,
		'size shoes: 9',
		'web',
		'help',
		'add help'
	].filter((s): s is string => !!s);

	// Everything that can be texted, for the message field's datalist. Claims
	// by name only work on the last list the phone was sent, but listing every
	// item keeps it simple.
	const options = [
		'list',
		...people.flatMap((p) => [`list ${key(p)}`, `list ${key(p)} all`]),
		...items
			.filter((i) => i.status === 'wanted' || i.status === 'claimed')
			.flatMap((i) => {
				const owner = people.find((p) => p.id === i.owner_id);
				const title = i.title.toLowerCase();
				return [`claim ${title}`, ...(owner ? [`claim ${title} for ${key(owner)}`] : [])];
			}),
		...[1, 2, 3, 4, 5].map((n) => `claim ${n}`),
		'add ',
		...people.map((p) => `ask about ${key(p)}`),
		'sizes',
		...people.map((p) => `sizes for ${key(p)}`),
		'size shoes: ',
		'web',
		'help',
		...['list', 'add', 'claim', 'ask', 'sizes', 'web'].map((topic) => `${topic} help`)
	];

	return {
		scenarios,
		commands: sms.COMMANDS,
		phones,
		suggestions,
		options: [...new Set(options)],
		missing: null
	};
};

// ------------------------------------------------------------ sandbox

// The sandbox runs texts through runSms(), exactly as POST /api/sms does,
// minus the signature check and the REST API calls to text other people.
const TWILIO_NUMBER = '+61400999000';

export const actions: Actions = {
	send: async (event) => {
		if (!dev) error(404, 'Not found');
		requireIdentity(event.locals);
		const form = await event.request.formData();
		const from = text(form, 'from', 20);
		const body = text(form, 'body', 1600);
		if (!from) return fail(400, { from: null, error: 'Choose which phone the text is from.' });
		if (!body) return fail(400, { from, error: 'Type a message to send.' });
		const save = form.get('save') === 'on';

		const env = getEnv();
		const result = await runSms(env.DB, {
			from,
			text: body,
			link: `${event.url.origin}/join/${env.FAMILY_TOKEN}`,
			save
		});

		const withSegments = (t: string) => ({ text: t, segments: sms.segments(t) });
		// What Twilio would POST to the webhook (form-encoded), trimmed to the useful fields.
		const twilioRequest = { From: from, To: TWILIO_NUMBER, Body: body, MessageSid: 'SM…' };
		const trace: TraceStep[] = [
			{
				title: 'Twilio calls the webhook',
				code: 'POST /api/sms',
				detail: Object.entries(twilioRequest)
					.map(([k, v]) => `${k}=${v}`)
					.join('&')
			},
			{
				title: 'Check X-Twilio-Signature',
				code: 'isValidTwilioRequest(authToken, url, params, signature)',
				detail:
					'Skipped in the sandbox. The real webhook rejects anything without a valid signature.'
			},
			...result.trace,
			{
				title: 'Return TwiML',
				code: 'toTwiml(reply)',
				detail:
					result.reply === null
						? 'An empty response, so Twilio sends nothing back.'
						: 'Twilio sends this message back to the sender.'
			},
			...result.outbound.map((o) => ({
				title: `Text ${o.name}`,
				code: 'waitUntil(sendSms(config, to, text))',
				detail: `After the reply, through Twilio’s REST API. Not sent from the sandbox: it appears on ${o.name}’s phone here instead.`
			}))
		];
		return {
			sent: {
				id: crypto.randomUUID(),
				from,
				fromName: result.sender?.name ?? 'Unknown number',
				body,
				reply: result.reply === null ? null : withSegments(result.reply),
				twiml: toTwiml(result.reply),
				trace,
				outbound: result.outbound.map((o) => ({ ...o, ...withSegments(o.text) })),
				changes: result.changes,
				saved: save
			}
		};
	},

	reset: async (event) => {
		if (!dev) error(404, 'Not found');
		requireIdentity(event.locals);
		await clearSmsContexts(getEnv().DB);
		return { cleared: true };
	}
};
