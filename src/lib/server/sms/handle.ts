// Runs one incoming text: who sent it, what it asks for, what to reply, and
// who else to text. Called through runSms() (run.ts) by the Twilio webhook
// and the dev sandbox. The "last list" context is loaded and saved by the
// caller, and `save: false` runs everything without writing to D1.
// Every decision is recorded in `trace`, which the sandbox shows step by step.

import {
	addEvergreenClaim,
	askForIdeas,
	claimItem,
	createItem,
	hasUnknownNumberTexted,
	listItemsFor,
	listMemberships,
	listPeople,
	listRecentClaims,
	listRecommenders,
	listSizes,
	removeSize,
	setSize,
	listRequestsAsked,
	listRequestsFrom,
	answerIdeaRequest,
	noteUnknownNumber
} from '../db.ts';
import { ideaTargets, parseIdeas } from '../ideas.ts';
import type { ItemFields } from '../db.ts';
import { canClaim, visibleIds } from '../permissions.ts';
import { parseSizeLines } from '../sizes.ts';
import { isGiverView, viewWishlist } from '../spoilers.ts';
import type { ItemRow, PersonRow } from '../../types.ts';
import {
	CONTEXT_TTL,
	isContextFresh,
	looksLikeCommand,
	matchItems,
	matchPeople,
	parseCommand,
	splitClaimFor,
	type SmsContext
} from './commands.ts';
import * as sms from './format.ts';

export interface SmsOutbound {
	name: string;
	phone: string;
	text: string;
}

export interface TraceStep {
	title: string;
	/** The function or query doing the work, e.g. `parseCommand(body)`. */
	code?: string;
	detail?: string;
	/** write: changed the database. stop: decided the reply. */
	kind?: 'info' | 'write' | 'stop';
}

export interface SmsResult {
	sender: { id: string; name: string } | null;
	/** null: send nothing back (an unknown number that has already been told). */
	reply: string | null;
	/** Texts to other people (idea requests and forwarded answers). */
	outbound: SmsOutbound[];
	/** What changed in the database, in words. */
	changes: string[];
	/** The new "last list" for this phone, or undefined to keep the old one. */
	context?: SmsContext | null;
	trace: TraceStep[];
}

export interface SmsRequest {
	from: string;
	text: string;
	context: SmsContext | null;
	/** The family link, for the `link` command (which adds who it's for). */
	link: string;
	save: boolean;
	now?: Date;
}

/** How each idea was read, for the step-through. */
function describeIdeas(ideas: readonly ItemFields[]): string {
	if (ideas.length === 0) return 'No ideas found.';
	return ideas
		.map((i) =>
			[
				`“${i.title}”`,
				i.url ? `link ${i.url}` : null,
				i.notes ? `notes “${i.notes}”` : null,
				i.evergreen ? 'always wanted' : null
			]
				.filter(Boolean)
				.join(', ')
		)
		.join('; ');
}

export async function handleSms(db: D1Database, request: SmsRequest): Promise<SmsResult> {
	const trace: TraceStep[] = [];
	const step = (title: string, code?: string, detail?: string, kind: TraceStep['kind'] = 'info') =>
		trace.push({ title, code, detail, kind });
	const saveNote = request.save ? '' : ' (preview only: not saved)';

	const everyone = await listPeople(db);
	const sender = everyone.find((p) => p.phone && p.phone === request.from.trim());
	if (!sender) {
		step('Look up the sender', 'listPeople(db)', `No one has the number ${request.from}.`);
		// Only the first text from an unknown number gets a reply.
		const phone = request.from.trim();
		const first = request.save
			? await noteUnknownNumber(db, phone)
			: !(await hasUnknownNumberTexted(db, phone));
		step(
			'Has this number texted before?',
			request.save ? 'noteUnknownNumber(db, from)' : 'hasUnknownNumberTexted(db, from)',
			first
				? `No. It gets one polite refusal${saveNote}.`
				: 'Yes, and it was already told. No reply, so it isn’t texted (or billed) again.',
			'stop'
		);
		return {
			sender: null,
			reply: first ? sms.UNKNOWN_NUMBER : null,
			outbound: [],
			changes: first && request.save ? [`Noted ${phone} as an unknown number`] : [],
			trace
		};
	}
	step('Look up the sender', 'listPeople(db)', `${request.from} belongs to ${sender.name}.`);
	// Like the website, a texter only finds and sees people sharing a group with them.
	const visible = visibleIds(sender.id, await listMemberships(db));
	const people = everyone.filter((p) => visible.has(p.id));

	const now = request.now ?? new Date();
	const result: SmsResult = {
		sender: { id: sender.id, name: sender.name },
		reply: '',
		outbound: [],
		changes: [],
		trace
	};
	const respond = (reply: string, extra: Partial<SmsResult> = {}) =>
		Object.assign(result, { reply }, extra);
	/** Records why this reply was chosen, then replies. */
	const stop = (why: string, reply: string, extra: Partial<SmsResult> = {}) => {
		step('Reply', undefined, why, 'stop');
		return respond(reply, extra);
	};
	const write = (title: string, code: string, detail: string) => {
		step(title, request.save ? code : undefined, detail + saveNote, 'write');
		result.changes.push(detail);
	};
	// Names (who claimed something, recommenders) show across groups; finding
	// someone to act on is limited to the texter's groups (`people`).
	const nameOf = (id: string | null) => everyone.find((p) => p.id === id)?.name ?? 'someone';

	/** One person from a typed name, or the reply explaining why not. */
	const findOne = (typed: string): PersonRow | string => {
		const matches = matchPeople(people, typed);
		const names = matches.map((p) => p.name).join(', ') || 'no one';
		step(`Find “${typed}”`, `matchPeople(people, '${typed}')`, `Matches ${names}.`);
		if (matches.length === 0) return sms.noSuchPerson(typed);
		if (matches.length > 1)
			return sms.whichPerson(
				typed,
				matches.map((p) => p.name)
			);
		return matches[0];
	};

	const command = parseCommand(request.text);
	step('Work out the command', 'parseCommand(body)', JSON.stringify(command));

	switch (command.kind) {
		case 'list':
		case 'listOf': {
			const owner = command.kind === 'list' ? sender : findOne(command.name);
			if (typeof owner === 'string') return stop('Couldn’t pick one person.', owner);
			const isOwn = owner.id === sender.id;
			const [items, claims] = await Promise.all([
				listItemsFor(db, owner.id),
				isOwn ? [] : listRecentClaims(db, owner.id)
			]);
			const view = viewWishlist(sender.id, [sender.id], owner.id, items, claims).filter(
				(v) => v.status === 'wanted' || v.status === 'claimed'
			);
			step(
				`Load ${isOwn ? 'their own' : `${owner.name}’s`} list`,
				'viewWishlist(sender, [sender], owner, items, claims)',
				isOwn
					? `${view.length} items. It’s their own list, so claims are stripped out (spoiler rules).`
					: `${view.length} items, with who claimed what and claim counts for always-wanted items.`
			);
			// Other people's claims are only counted unless they asked for "all".
			const all = command.kind === 'listOf' && command.all;
			const claimedByOthers = (v: (typeof view)[number]) =>
				isGiverView(v) && v.status === 'claimed' && v.claimed_by_id !== sender.id;
			const shown = isOwn || all ? view : view.filter((v) => !claimedByOthers(v));
			const hiddenClaims = view.length - shown.length;
			if (!isOwn) {
				step(
					all ? 'Keep everyone’s claims' : 'Leave out what others have claimed',
					all
						? undefined
						: "view.filter((v) => v.status !== 'claimed' || v.claimed_by_id === sender)",
					all
						? 'They asked for the whole list.'
						: `${shown.length} available or claimed by ${sender.name}; ${hiddenClaims} claimed by others, counted only.`
				);
			}
			const context = { ownerId: owner.id, itemIds: shown.map((v) => v.id), at: now.getTime() };
			step(
				'Remember this list for the phone',
				'context = { ownerId, itemIds, at }',
				`So “claim 2” or “claim <name>” knows which items these are, for the next ${CONTEXT_TTL / 60000} minutes.`
			);
			if (isOwn) {
				return stop('Send the numbered list.', sms.ownList(view.map((v) => ({ title: v.title }))), {
					context
				});
			}
			const list = shown.map((v) => ({
				title: v.title,
				evergreenClaims: isGiverView(v) && v.evergreen ? v.recent_claims.length : null,
				claimedBy:
					isGiverView(v) && v.status === 'claimed'
						? v.claimed_by_id === sender.id
							? 'you'
							: nameOf(v.claimed_by_id)
						: null
			}));
			const again = `list ${command.kind === 'listOf' ? command.name.toLowerCase() : ''}`;
			return stop('Send the numbered list.', sms.theirList(owner.name, list, hiddenClaims, again), {
				context
			});
		}

		case 'add': {
			const ideas = parseIdeas(command.text);
			step('Read the items', 'parseIdeas(text)', describeIdeas(ideas));
			if (ideas.length === 0) return stop('Nothing to add.', sms.HELP);
			for (const idea of ideas) {
				if (request.save) await createItem(db, sender.id, sender.id, idea);
				write(
					'Add the item',
					'createItem(db, sender, sender, idea)',
					`Added “${idea.title}”${idea.evergreen ? ' (always wanted)' : ''} to ${sender.name}’s list`
				);
			}
			return stop('Confirm what was added.', sms.added(ideas.map((i) => i.title)));
		}

		case 'claim':
		case 'claimByName': {
			// Claiming is the last step: there's no separate "given" step.
			let item: ItemRow | null = null;

			// "claim <item> for <name>" searches that person's list directly.
			const query = command.kind === 'claimByName' ? command.query : null;
			const forSplit = query ? splitClaimFor(query, people) : null;
			if (forSplit) {
				step(
					'Split off whose list it is',
					`splitClaimFor('${query}', people)`,
					`Item “${forSplit.item}”, for “${forSplit.name}” (matches ${forSplit.matches.map((p) => p.name).join(', ')}).`
				);
				if (forSplit.matches.length > 1) {
					return stop(
						'Couldn’t pick one person.',
						sms.whichPerson(
							forSplit.name,
							forSplit.matches.map((p) => p.name)
						)
					);
				}
				const owner = forSplit.matches[0];
				if (owner.id === sender.id) return stop('It’s their own list.', sms.cantClaimOwn);
				const onList = (await listItemsFor(db, owner.id)).filter(
					(i) => i.status === 'wanted' || i.status === 'claimed'
				);
				const matches = matchItems(onList, forSplit.item);
				step(
					`Match “${forSplit.item}” against ${owner.name}’s list`,
					`matchItems(listItemsFor(db, '${owner.id}'), '${forSplit.item}')`,
					matches.length
						? `${matches.length} match: ${matches.map((m) => m.title).join(', ')}.`
						: 'Nothing matches.'
				);
				if (matches.length > 1) {
					// Number just the matches, so "claim 2" picks one of them next.
					const numbered = matches.map((m, n) => ({ n: n + 1, title: m.title }));
					const context = {
						ownerId: owner.id,
						itemIds: matches.map((m) => m.id),
						at: now.getTime()
					};
					return stop(
						'More than one item matched, so ask which (and remember these as the list).',
						sms.whichItem(forSplit.item, numbered),
						{ context }
					);
				}
				if (matches.length === 1) {
					item = matches[0];
				} else if (!isContextFresh(request.context, now.getTime())) {
					return stop('No item matched.', sms.noMatchingItemFor(forSplit.item, owner.name));
				} else {
					// The whole text might be an item name with "for" in it on the last list.
					step('Try the whole text against the last list instead', undefined, undefined);
				}
			}

			if (!item) {
				if (!isContextFresh(request.context, now.getTime())) {
					step(
						'Find the last list sent to this phone',
						'isContextFresh(context)',
						request.context ? 'It’s more than 30 minutes old.' : 'No list has been sent yet.'
					);
					return stop('Item numbers and names need a list first.', sms.noRecentList);
				}
				const context = request.context!;
				const items = await listItemsFor(db, context.ownerId);
				// The last list as it was numbered, minus anything deleted since.
				const list = context.itemIds
					.map((id, i) => ({ n: i + 1, item: items.find((row) => row.id === id) }))
					.filter((entry): entry is { n: number; item: ItemRow } => !!entry.item);
				const minutes = Math.round((now.getTime() - context.at) / 60000);
				step(
					'Find the last list sent to this phone',
					'listItemsFor(db, context.ownerId)',
					`${nameOf(context.ownerId)}’s list, sent ${minutes === 0 ? 'just now' : `${minutes} min ago`}, ${context.itemIds.length} items.`
				);

				if (command.kind === 'claim') {
					if (!context.itemIds[command.n - 1]) {
						return stop(
							`There’s no item ${command.n}.`,
							sms.noSuchItem(command.n, context.itemIds.length)
						);
					}
					const found = list.find((entry) => entry.n === command.n);
					if (!found) return stop('That item was deleted since the list was sent.', sms.itemGone);
					item = found.item;
					step(`Pick item ${command.n}`, undefined, `“${item.title}”.`);
				} else {
					const matches = matchItems(
						list.map((entry) => ({ ...entry, title: entry.item.title })),
						command.query
					);
					step(
						`Match “${command.query}” against the item names`,
						`matchItems(list, '${command.query}')`,
						matches.length
							? `${matches.length} match: ${matches.map((m) => `${m.n}. ${m.title}`).join(', ')}.`
							: 'Nothing matches.'
					);
					if (matches.length === 0) {
						return stop(
							'No item matched.',
							forSplit && forSplit.matches.length === 1
								? sms.noMatchingItemFor(forSplit.item, forSplit.matches[0].name)
								: sms.noMatchingItem(command.query)
						);
					}
					if (matches.length > 1) {
						return stop(
							'More than one item matched, so ask which.',
							sms.whichItem(command.query, matches)
						);
					}
					item = matches[0].item;
				}
			}

			const owner = nameOf(item.owner_id);
			step(
				'Check the item can be claimed',
				'canClaim(sender, item)',
				`Status: ${item.status}${item.evergreen ? ', always wanted' : ''}${item.claimed_by_id ? `, claimed by ${nameOf(item.claimed_by_id)}` : ''}.`
			);
			if (item.owner_id === sender.id) {
				return stop('It’s on their own list.', sms.ownItem(item.title));
			}
			if (item.status === 'claimed') {
				return stop(
					'Someone has already claimed it.',
					item.claimed_by_id === sender.id
						? sms.alreadyYours(item.title)
						: sms.alreadyClaimed(item.title, nameOf(item.claimed_by_id))
				);
			}
			if (!canClaim(sender.id, item)) {
				return stop('It’s been removed from the list.', sms.itemGone);
			}
			if (item.evergreen) {
				const recent = (await listRecentClaims(db, item.owner_id)).filter(
					(c) => c.item_id === item.id
				);
				step(
					'Count claims in the last 6 months',
					'listRecentClaims(db, owner)',
					recent.length ? recent.map((c) => nameOf(c.claimed_by_id)).join(', ') : 'None yet.'
				);
				if (recent.some((c) => c.claimed_by_id === sender.id)) {
					return stop(
						`${sender.name} already claimed it in the last 6 months.`,
						sms.alreadyClaimedEvergreen(item.title)
					);
				}
				if (request.save && !(await addEvergreenClaim(db, item.id, sender.id, sender.id))) {
					return stop('It changed just now.', sms.alreadyClaimedEvergreen(item.title));
				}
				write(
					'Record the claim (the item stays on the list)',
					'addEvergreenClaim(db, item, sender, sender)',
					`${sender.name} claimed always-wanted “${item.title}” for ${owner}`
				);
				return stop(
					'Confirm the claim.',
					sms.claimedEvergreen(item.title, owner, recent.length + 1)
				);
			}
			if (request.save && !(await claimItem(db, item.id, sender.id, sender.id))) {
				return stop(
					'Someone else claimed it a moment ago.',
					sms.alreadyClaimed(item.title, 'someone else')
				);
			}
			write(
				'Claim it',
				"claimItem(db, item, sender, sender) -- UPDATE ... WHERE status = 'wanted'",
				`${sender.name} claimed “${item.title}” for ${owner}`
			);
			return stop('Confirm the claim.', sms.claimed(item.title, owner));
		}

		case 'ask': {
			const about = findOne(command.about);
			if (typeof about === 'string') return stop('Couldn’t pick one person.', about);
			if (about.id === sender.id) return stop('They asked about themselves.', sms.cantAsk);
			const recommenders = await listRecommenders(db, about.id);
			const targetIds = ideaTargets(recommenders, about.id, sender.id);
			step(
				`Find ${about.name}’s recommenders`,
				'ideaTargets(listRecommenders(db, about), about, sender)',
				recommenders.length
					? `${recommenders.map(nameOf).join(', ')}${recommenders.includes(sender.id) ? ` (not ${sender.name}, who is asking)` : ''}.`
					: `None, so ${about.name} is asked to add to their own list.`
			);
			const open = new Set(
				(await listRequestsFrom(db, sender.id))
					.filter((r) => r.status === 'open' && r.about_id === about.id)
					.map((r) => r.asked_id)
			);
			// Recommenders can be outside the texter's groups; they're still asked.
			const targets = everyone.filter((p) => targetIds.includes(p.id) && !open.has(p.id));
			if (open.size > 0) {
				step(
					'Skip anyone still to reply',
					'listRequestsFrom(db, sender)',
					`Already waiting on ${[...open].map(nameOf).join(', ')}.`
				);
			}
			if (targets.length === 0) {
				return stop('Everyone has already been asked.', sms.alreadyAsked(about.name));
			}
			if (request.save) await askForIdeas(db, sender.id, about.id);

			const self = targets.length === 1 && targets[0].id === about.id;
			for (const target of targets) {
				write(
					`Create a request for ${target.name}`,
					'askForIdeas(db, sender, about)',
					`Idea request: ${sender.name} asked ${target.name} about ${self ? 'themselves' : about.name}`
				);
				if (target.phone) {
					result.outbound.push({
						name: target.name,
						phone: target.phone,
						text: self ? sms.ideaRequestSelf(sender.name) : sms.ideaRequest(sender.name, about.name)
					});
				}
			}
			const offline = targets.filter((t) => !t.phone);
			step(
				'Queue texts to the people asked',
				'outbound.push({ phone, text })',
				[
					targets.some((t) => t.phone)
						? `Texting ${targets
								.filter((t) => t.phone)
								.map((t) => t.name)
								.join(', ')}.`
						: '',
					offline.length
						? `${offline.map((t) => t.name).join(', ')} ${offline.length === 1 ? 'has' : 'have'} no phone, so only see it on the website.`
						: ''
				]
					.filter(Boolean)
					.join(' ')
			);
			if (self) {
				return stop(
					'Tell the asker who was asked.',
					sms.askedThemselves(about.name, !!about.phone)
				);
			}
			return stop(
				'Tell the asker who was asked.',
				sms.asked(
					targets.filter((t) => t.phone).map((t) => t.name),
					offline.map((t) => t.name),
					about.name
				)
			);
		}

		case 'help': {
			const topic = sms.helpTopic(command.topic);
			step(
				'Pick the help',
				`helpTopic('${command.topic ?? ''}')`,
				topic ? `Detailed help for “${topic}”.` : 'Every command, with examples.'
			);
			// Examples use a real family member, preferring a one-word name ("Mia",
			// not "Grandma June") so "list mia" works exactly as shown.
			const others = people.filter((p) => p.id !== sender.id);
			const example = others.find((p) => !p.name.includes(' ')) ?? others[0] ?? sender;
			return stop('Send the help.', sms.help(topic, example.name.split(' ')[0]));
		}

		case 'web': {
			// ?me= makes the link sign this phone's browser in as the sender.
			const url = `${request.link}?me=${encodeURIComponent(sender.id)}`;
			step(
				'Build the link',
				'`${familyLink}?me=${sender.id}`',
				`Opening it signs the browser in as ${sender.name}${sender.pin_hash ? ', after their PIN' : ''}.`
			);
			return stop('Send the family link.', sms.link(url));
		}

		case 'sizes':
		case 'sizesOf': {
			let person: PersonRow = sender;
			if (command.kind === 'sizesOf') {
				const found = findOne(command.name);
				if (typeof found === 'string') {
					// "size shoes 9" (no colon) lands here: explain the format.
					return stop('Couldn’t pick one person.', `${found} ${sms.sizesHelp}`);
				}
				person = found;
			}
			const sizes = await listSizes(db, person.id);
			const own = person.id === sender.id;
			step(
				`Load ${own ? 'their own' : `${person.name}’s`} sizes`,
				`listSizes(db, '${person.id}')`,
				sizes.length ? sizes.map((s) => `${s.item}: ${s.size}`).join(', ') : 'None yet.'
			);
			return stop('Send the sizes.', sms.sizesList(own ? null : person.name, sizes, now));
		}

		case 'setSizes': {
			// Only ever your own sizes by text.
			const changes = parseSizeLines(command.text);
			step(
				'Read the sizes',
				'parseSizeLines(text)',
				changes.length
					? changes.map((c) => `${c.item} → ${c.size ?? 'remove'}`).join(', ')
					: 'Nothing in “item: size” form.'
			);
			if (changes.length === 0) return stop('Nothing to change.', sms.sizesHelp);
			const existing = await listSizes(db, sender.id);
			const has = (item: string) =>
				existing.some((s) => s.item.toLowerCase() === item.toLowerCase());
			const saved: { item: string; size: string }[] = [];
			const removed: string[] = [];
			const missing: string[] = [];
			for (const change of changes) {
				if (change.size === null) {
					if (!has(change.item)) {
						missing.push(change.item);
						continue;
					}
					if (request.save) await removeSize(db, sender.id, change.item);
					removed.push(change.item);
					write(
						'Remove a size',
						'removeSize(db, sender, item)',
						`Removed ${sender.name}’s ${change.item} size`
					);
				} else {
					if (request.save) await setSize(db, sender.id, change.item, change.size);
					saved.push({ item: change.item, size: change.size });
					write(
						has(change.item) ? 'Change a size' : 'Add a size',
						'setSize(db, sender, item, size)',
						`${sender.name}’s ${change.item} size is now ${change.size}`
					);
				}
			}
			return stop('Confirm the changes.', sms.sizesSaved(saved, removed, missing));
		}

		case 'unknown': {
			// Free text answers the newest open idea request this person was asked,
			// unless it looks like a mistyped command.
			if (looksLikeCommand(command.text)) {
				step(
					'Looks like a mistyped command',
					'looksLikeCommand(body)',
					'Starts with a command word, so it isn’t treated as an answer to an idea request.'
				);
				return stop('Send the list of commands.', sms.HELP);
			}
			const pending = (await listRequestsAsked(db, sender.id)).find((r) => r.status === 'open');
			step(
				'Is it an answer to an idea request?',
				'listRequestsAsked(db, sender)',
				pending
					? `Yes: ${nameOf(pending.from_id)} asked ${sender.name} about ${pending.about_id === sender.id ? 'themselves' : nameOf(pending.about_id)}.`
					: `No open requests for ${sender.name}.`
			);
			if (!pending) return stop('Not a command or an answer.', sms.HELP);
			// Answering a request about yourself adds to your own list.
			const self = pending.about_id === sender.id;
			const suggestedBy = self ? null : sender.name;
			const ideas = request.save
				? await answerIdeaRequest(db, pending, command.text, suggestedBy)
				: parseIdeas(command.text, suggestedBy);
			step('Read the ideas', 'parseIdeas(body, suggestedBy)', describeIdeas(ideas));
			const from = everyone.find((p) => p.id === pending.from_id);
			const about = nameOf(pending.about_id);
			write(
				'Save the answer',
				'answerIdeaRequest(db, request, body, suggestedBy)',
				`${sender.name} answered ${from?.name ?? 'someone'}’s request about ${self ? 'themselves' : about}`
			);
			for (const idea of ideas) {
				write(
					`Add it to ${about}’s list`,
					'createItem(db, about, sender, idea)',
					`Added “${idea.title}”${idea.evergreen ? ' (always wanted)' : ''} to ${about}’s list`
				);
			}
			if (from?.phone) {
				result.outbound.push({
					name: from.name,
					phone: from.phone,
					text: sms.ideaForwarded(sender.name, about, command.text)
				});
				step('Forward the answer', 'outbound.push({ phone, text })', `Texting ${from.name}.`);
			}
			return stop(
				'Thank them.',
				sms.ideaThanks(from?.name ?? 'them', self ? null : about, ideas.length)
			);
		}
	}
}
