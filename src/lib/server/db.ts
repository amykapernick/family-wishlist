// D1 queries. Plain prepared statements; callers check permissions first.

import type {
	IdeaRequestRow,
	ItemClaimRow,
	ItemRow,
	PersonRow,
	PublicPerson,
	SizeRow
} from '#lib/types.ts';
import { ideaTargets, parseIdeas } from './ideas.ts';
import { CONTEXT_TTL, type SmsContext } from './sms/commands.ts';

export function toPublicPerson(row: PersonRow): PublicPerson {
	return {
		id: row.id,
		name: row.name,
		has_pin: row.pin_hash !== null,
		is_admin: row.is_admin === 1
	};
}

// ---------------------------------------------------------------- people

export async function listPeople(db: D1Database): Promise<PersonRow[]> {
	const { results } = await db
		.prepare('SELECT * FROM people ORDER BY name COLLATE NOCASE')
		.all<PersonRow>();
	return results;
}

export async function getPerson(db: D1Database, id: string): Promise<PersonRow | null> {
	return db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first<PersonRow>();
}

export async function createPerson(
	db: D1Database,
	person: { name: string; phone: string | null },
	options: { isAdmin?: boolean; pinHash?: string | null } = {}
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			// kind is no longer used, but the column is NOT NULL.
			`INSERT INTO people (id, name, kind, phone, is_admin, pin_hash) VALUES (?, ?, 'adult', ?, ?, ?)`
		)
		.bind(id, person.name, person.phone, options.isAdmin ? 1 : 0, options.pinHash ?? null)
		.run();
	return id;
}

/** Adds several people (not admins, no PINs) all at once, or none if one fails. */
export async function createPeople(
	db: D1Database,
	people: readonly { name: string; phone: string | null }[]
) {
	if (people.length === 0) return;
	const insert = db.prepare(
		`INSERT INTO people (id, name, kind, phone, is_admin, pin_hash) VALUES (?, ?, 'adult', ?, 0, NULL)`
	);
	await db.batch(people.map((p) => insert.bind(crypto.randomUUID(), p.name, p.phone)));
}

export async function setPersonAdmin(db: D1Database, id: string, isAdmin: boolean) {
	await db
		.prepare('UPDATE people SET is_admin = ? WHERE id = ?')
		.bind(isAdmin ? 1 : 0, id)
		.run();
}

export interface PersonData {
	items: number;
	claims: number;
	requests: number;
	sizes: number;
}

/** What removing each person would delete, and how many claims lose their name. */
export async function listPersonData(db: D1Database): Promise<Record<string, PersonData>> {
	const { results } = await db
		.prepare(
			`SELECT p.id,
			   (SELECT COUNT(*) FROM items WHERE owner_id = p.id AND status <> 'archived') AS items,
			   (SELECT COUNT(*) FROM items WHERE claimed_by_id = p.id AND owner_id <> p.id)
			     + (SELECT COUNT(*) FROM item_claims c JOIN items i ON i.id = c.item_id
			        WHERE c.claimed_by_id = p.id AND i.owner_id <> p.id) AS claims,
			   (SELECT COUNT(*) FROM idea_requests WHERE p.id IN (from_id, about_id, asked_id)) AS requests,
			   (SELECT COUNT(*) FROM sizes WHERE person_id = p.id) AS sizes
			 FROM people p`
		)
		.all<PersonData & { id: string }>();
	return Object.fromEntries(results.map(({ id, ...data }) => [id, data]));
}

/**
 * Removes a person and everything that's theirs, in one transaction: their
 * list (and its history), sizes, idea requests and recommender links. Claims
 * they made on other lists (current, past and evergreen) are kept, just
 * without their name.
 */
export async function deletePerson(db: D1Database, id: string) {
	const run = (sql: string) => db.prepare(sql).bind(id);
	await db.batch([
		run('DELETE FROM item_claims WHERE item_id IN (SELECT id FROM items WHERE owner_id = ?1)'),
		run('UPDATE item_claims SET claimed_by_id = NULL WHERE claimed_by_id = ?1'),
		run('UPDATE item_claims SET entered_by_id = NULL WHERE entered_by_id = ?1'),
		run(
			'DELETE FROM sms_contexts WHERE owner_id = ?1 OR phone = (SELECT phone FROM people WHERE id = ?1)'
		),
		run('DELETE FROM items WHERE owner_id = ?1'),
		run('UPDATE items SET claimed_by_id = NULL WHERE claimed_by_id = ?1'),
		run('UPDATE items SET entered_by_id = NULL WHERE entered_by_id = ?1'),
		run('UPDATE items SET created_by_id = NULL WHERE created_by_id = ?1'),
		run('DELETE FROM idea_requests WHERE ?1 IN (from_id, about_id, asked_id)'),
		run('DELETE FROM contacts WHERE ?1 IN (person_id, contact_id)'),
		run('DELETE FROM sizes WHERE person_id = ?1'),
		run('DELETE FROM can_act_for WHERE ?1 IN (person_id, acts_for_id)'),
		run(`DELETE FROM auth_attempts WHERE key LIKE 'person:' || ?1 || ':%'`),
		run('DELETE FROM people WHERE id = ?1')
	]);
}

export async function updatePerson(
	db: D1Database,
	id: string,
	person: { name: string; phone: string | null }
): Promise<void> {
	await db
		.prepare('UPDATE people SET name = ?, phone = ? WHERE id = ?')
		.bind(person.name, person.phone, id)
		.run();
}

export async function setPersonPin(db: D1Database, id: string, pinHash: string | null) {
	await db.prepare('UPDATE people SET pin_hash = ? WHERE id = ?').bind(pinHash, id).run();
}

// ---------------------------------------------------------------- items

export async function listAllItems(db: D1Database): Promise<ItemRow[]> {
	const { results } = await db.prepare('SELECT * FROM items').all<ItemRow>();
	return results;
}

export async function listItemsFor(db: D1Database, ownerId: string): Promise<ItemRow[]> {
	const { results } = await db
		.prepare('SELECT * FROM items WHERE owner_id = ? ORDER BY created_at, rowid')
		.bind(ownerId)
		.all<ItemRow>();
	return results;
}

export async function getItem(db: D1Database, id: string): Promise<ItemRow | null> {
	return db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
}

export interface ItemFields {
	title: string;
	url: string | null;
	notes: string | null;
	evergreen: boolean;
}

export async function createItem(
	db: D1Database,
	ownerId: string,
	createdById: string,
	fields: ItemFields
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO items (id, owner_id, title, url, notes, evergreen, created_by_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			ownerId,
			fields.title,
			fields.url,
			fields.notes,
			Number(fields.evergreen),
			createdById
		)
		.run();
	return id;
}

/** Adds several items in one go, or none if one fails. */
export async function createItems(
	db: D1Database,
	ownerId: string,
	createdById: string,
	items: readonly ItemFields[]
) {
	if (items.length === 0) return;
	const insert = db.prepare(
		`INSERT INTO items (id, owner_id, title, url, notes, evergreen, created_by_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	);
	await db.batch(
		items.map((item) =>
			insert.bind(
				crypto.randomUUID(),
				ownerId,
				item.title,
				item.url,
				item.notes,
				Number(item.evergreen),
				createdById
			)
		)
	);
}

export async function updateItem(db: D1Database, id: string, fields: ItemFields) {
	await db
		.prepare(
			`UPDATE items SET title = ?, url = ?, notes = ?,
			 evergreen = CASE WHEN status = 'wanted' THEN ? ELSE evergreen END,
			 updated_at = datetime('now')
			 WHERE id = ? AND status <> 'archived'`
		)
		.bind(fields.title, fields.url, fields.notes, Number(fields.evergreen), id)
		.run();
}

/**
 * Hard delete, only ever for items that have never been claimed (including
 * evergreen claims). Returns false if it was claimed meanwhile.
 */
export async function deleteWantedItem(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare(
			`DELETE FROM items WHERE id = ?1 AND status = 'wanted' AND claimed_at IS NULL
			 AND NOT EXISTS (SELECT 1 FROM item_claims WHERE item_id = ?1)`
		)
		.bind(id)
		.run();
	return result.meta.changes > 0;
}

export async function archiveItem(db: D1Database, id: string) {
	await db
		.prepare(`UPDATE items SET status = 'archived', updated_at = datetime('now') WHERE id = ?`)
		.bind(id)
		.run();
}

// ------------------------------------------------------ evergreen claims

const RECENT = `datetime('now', '-6 months')`;

/** Evergreen claims on someone's list from the last six months, newest first. */
export async function listRecentClaims(db: D1Database, ownerId: string): Promise<ItemClaimRow[]> {
	const { results } = await db
		.prepare(
			`SELECT c.* FROM item_claims c JOIN items i ON i.id = c.item_id
			 WHERE i.owner_id = ? AND c.created_at >= ${RECENT}
			 ORDER BY c.created_at DESC`
		)
		.bind(ownerId)
		.all<ItemClaimRow>();
	return results;
}

/**
 * Records a claim on an evergreen item. Returns false if the item isn't an
 * available evergreen item, or the giver already claimed it in the last six months.
 */
export async function addEvergreenClaim(
	db: D1Database,
	itemId: string,
	claimedById: string,
	enteredById: string
): Promise<boolean> {
	const result = await db
		.prepare(
			`INSERT INTO item_claims (id, item_id, claimed_by_id, entered_by_id)
			 SELECT ?1, ?2, ?3, ?4 WHERE
			   EXISTS (SELECT 1 FROM items WHERE id = ?2 AND evergreen = 1 AND status = 'wanted')
			   AND NOT EXISTS (SELECT 1 FROM item_claims
			     WHERE item_id = ?2 AND claimed_by_id = ?3 AND created_at >= ${RECENT})`
		)
		.bind(crypto.randomUUID(), itemId, claimedById, enteredById)
		.run();
	return result.meta.changes > 0;
}

export async function removeEvergreenClaim(db: D1Database, claimId: string) {
	await db.prepare('DELETE FROM item_claims WHERE id = ?').bind(claimId).run();
}

/** Evergreen claims for Past gifts, each dated by when it was claimed. */
export async function listEvergreenHistory(db: D1Database, ownerId: string, since: string | null) {
	const sql = `SELECT c.id, c.claimed_by_id, c.created_at, i.title, i.url
		FROM item_claims c JOIN items i ON i.id = c.item_id
		WHERE i.owner_id = ? ${since ? 'AND c.created_at >= ?' : ''}
		ORDER BY c.created_at DESC`;
	const stmt = since ? db.prepare(sql).bind(ownerId, since) : db.prepare(sql).bind(ownerId);
	const { results } = await stmt.all<{
		id: string;
		claimed_by_id: string;
		created_at: string;
		title: string;
		url: string | null;
	}>();
	return results;
}

/** Returns false if somebody else claimed it first. */
export async function claimItem(
	db: D1Database,
	id: string,
	claimedById: string,
	enteredById: string
): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE items SET status = 'claimed', claimed_by_id = ?, entered_by_id = ?,
			 claimed_at = datetime('now'), updated_at = datetime('now')
			 WHERE id = ? AND status = 'wanted' AND evergreen = 0`
		)
		.bind(claimedById, enteredById, id)
		.run();
	return result.meta.changes > 0;
}

export async function unclaimItem(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE items SET status = 'wanted', claimed_by_id = NULL, entered_by_id = NULL,
			 claimed_at = NULL, updated_at = datetime('now')
			 WHERE id = ? AND status = 'claimed'`
		)
		.bind(id)
		.run();
	return result.meta.changes > 0;
}

/** Everything claimed for someone (still on their list or since removed), newest first. */
export async function listClaimHistory(
	db: D1Database,
	ownerId: string,
	since: string | null
): Promise<ItemRow[]> {
	const sql = `SELECT * FROM items WHERE owner_id = ?
		AND status IN ('claimed', 'archived') AND claimed_at IS NOT NULL
		${since ? 'AND claimed_at >= ?' : ''} ORDER BY claimed_at DESC`;
	const stmt = since ? db.prepare(sql).bind(ownerId, since) : db.prepare(sql).bind(ownerId);
	const { results } = await stmt.all<ItemRow>();
	return results;
}

// -------------------------------------------------------- idea requests

/** One request per person asked, skipping anyone already asked and not yet answered. */
export async function createIdeaRequests(
	db: D1Database,
	request: { fromId: string; aboutId: string; askedIds: string[] }
): Promise<{ created: string[]; skipped: string[] }> {
	const { results } = await db
		.prepare(
			`SELECT asked_id FROM idea_requests
			 WHERE from_id = ? AND about_id = ? AND status = 'open'`
		)
		.bind(request.fromId, request.aboutId)
		.all<{ asked_id: string }>();
	const alreadyOpen = new Set(results.map((r) => r.asked_id));
	const created = request.askedIds.filter((id) => !alreadyOpen.has(id));
	if (created.length > 0) {
		await db.batch(
			created.map((askedId) =>
				db
					.prepare(
						'INSERT INTO idea_requests (id, from_id, about_id, asked_id) VALUES (?, ?, ?, ?)'
					)
					.bind(crypto.randomUUID(), request.fromId, request.aboutId, askedId)
			)
		);
	}
	return { created, skipped: request.askedIds.filter((id) => alreadyOpen.has(id)) };
}

export async function getIdeaRequest(db: D1Database, id: string) {
	return db.prepare('SELECT * FROM idea_requests WHERE id = ?').bind(id).first<IdeaRequestRow>();
}

export async function listRequestsAbout(db: D1Database, aboutId: string) {
	const { results } = await db
		.prepare('SELECT * FROM idea_requests WHERE about_id = ? ORDER BY created_at DESC')
		.bind(aboutId)
		.all<IdeaRequestRow>();
	return results;
}

export async function listRequestsAsked(db: D1Database, askedId: string) {
	const { results } = await db
		.prepare(
			`SELECT * FROM idea_requests WHERE asked_id = ?
			 ORDER BY status = 'open' DESC, created_at DESC`
		)
		.bind(askedId)
		.all<IdeaRequestRow>();
	return results;
}

/**
 * Saves an answer. The first answer to a request is also added to the list of
 * the person it's about, one item per idea (see `parseIdeas`); later edits to
 * the answer only update the request. Returns the items added.
 */
export async function answerIdeaRequest(
	db: D1Database,
	request: IdeaRequestRow,
	response: string,
	suggestedBy: string | null
): Promise<ItemFields[]> {
	const first = await db
		.prepare(
			`UPDATE idea_requests SET response = ?, status = 'answered' WHERE id = ? AND status = 'open'`
		)
		.bind(response, request.id)
		.run();
	if (first.meta.changes === 0) {
		await db
			.prepare(`UPDATE idea_requests SET response = ? WHERE id = ? AND status <> 'closed'`)
			.bind(response, request.id)
			.run();
		return [];
	}
	const ideas = parseIdeas(response, suggestedBy);
	for (const idea of ideas) await createItem(db, request.about_id, request.asked_id, idea);
	return ideas;
}

// ---------------------------------------------------------- recommenders

// Stored in the spec's `contacts` table: person_id is the person, contact_id
// one of the people asked for ideas about them.

export async function listAllRecommenders(db: D1Database) {
	const { results } = await db
		.prepare('SELECT person_id, contact_id AS recommender_id FROM contacts')
		.all<{ person_id: string; recommender_id: string }>();
	return results;
}

export async function listRecommenders(db: D1Database, personId: string): Promise<string[]> {
	const { results } = await db
		.prepare('SELECT contact_id FROM contacts WHERE person_id = ?')
		.bind(personId)
		.all<{ contact_id: string }>();
	return results.map((r) => r.contact_id);
}

export async function setRecommenders(db: D1Database, personId: string, ids: readonly string[]) {
	await db.batch([
		db.prepare('DELETE FROM contacts WHERE person_id = ?').bind(personId),
		...ids.map((id) =>
			db.prepare('INSERT INTO contacts (person_id, contact_id) VALUES (?, ?)').bind(personId, id)
		)
	]);
}

/** Asks everyone `ideaTargets` picks. Skips anyone already asked and not yet answered. */
export async function askForIdeas(
	db: D1Database,
	fromId: string,
	aboutId: string,
	alsoAskThem = false
) {
	const askedIds = ideaTargets(await listRecommenders(db, aboutId), aboutId, fromId, alsoAskThem);
	return { askedIds, ...(await createIdeaRequests(db, { fromId, aboutId, askedIds })) };
}

export async function closeIdeaRequest(db: D1Database, id: string) {
	await db.prepare(`UPDATE idea_requests SET status = 'closed' WHERE id = ?`).bind(id).run();
}

// ------------------------------------------------------- auth throttle

const MAX_ATTEMPTS = 5;
const WINDOW = '-15 minutes';

export async function isThrottled(db: D1Database, key: string): Promise<boolean> {
	const row = await db
		.prepare(`SELECT count FROM auth_attempts WHERE key = ? AND window_start > datetime('now', ?)`)
		.bind(key, WINDOW)
		.first<{ count: number }>();
	return (row?.count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(db: D1Database, key: string) {
	await db
		.prepare(
			`INSERT INTO auth_attempts (key, count, window_start) VALUES (?1, 1, datetime('now'))
			 ON CONFLICT (key) DO UPDATE SET
			   count = CASE WHEN window_start <= datetime('now', ?2) THEN 1 ELSE count + 1 END,
			   window_start = CASE WHEN window_start <= datetime('now', ?2)
			     THEN datetime('now') ELSE window_start END`
		)
		.bind(key, WINDOW)
		.run();
}

export async function clearAttempts(db: D1Database, key: string) {
	await db.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(key).run();
}

/** Keys currently locked out, for the admin page. */
export async function listLockouts(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT key FROM auth_attempts WHERE count >= ? AND window_start > datetime('now', ?)
			 ORDER BY window_start DESC`
		)
		.bind(MAX_ATTEMPTS, WINDOW)
		.all<{ key: string }>();
	return results.map((r) => r.key);
}

export async function clearAllAttempts(db: D1Database) {
	await db.prepare('DELETE FROM auth_attempts').run();
}

// -------------------------------------------------------- app settings

export async function getSessionEpoch(db: D1Database): Promise<string> {
	const row = await db
		.prepare(`SELECT value FROM app_settings WHERE key = 'session_epoch'`)
		.first<{ value: string }>();
	return row?.value ?? '1';
}

/** Invalidates every family cookie issued so far. Returns the new epoch. */
export async function bumpSessionEpoch(db: D1Database): Promise<string> {
	const row = await db
		.prepare(
			`INSERT INTO app_settings (key, value) VALUES ('session_epoch', '2')
			 ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
			 RETURNING value`
		)
		.first<{ value: string | number }>();
	return String(row?.value ?? '2');
}

export async function listRequestsFrom(db: D1Database, fromId: string) {
	const { results } = await db
		.prepare('SELECT * FROM idea_requests WHERE from_id = ? ORDER BY created_at DESC')
		.bind(fromId)
		.all<IdeaRequestRow>();
	return results;
}

// ------------------------------------------------------ unknown numbers

/** Records a text from an unknown number. Returns true the first time that number texts. */
export async function noteUnknownNumber(db: D1Database, phone: string): Promise<boolean> {
	const row = await db
		.prepare(
			`INSERT INTO sms_unknown_numbers (phone) VALUES (?)
			 ON CONFLICT (phone) DO UPDATE SET last_seen = datetime('now'), texts = texts + 1
			 RETURNING texts`
		)
		.bind(phone)
		.first<{ texts: number }>();
	return row?.texts === 1;
}

export async function hasUnknownNumberTexted(db: D1Database, phone: string): Promise<boolean> {
	const row = await db
		.prepare('SELECT 1 AS seen FROM sms_unknown_numbers WHERE phone = ?')
		.bind(phone)
		.first<{ seen: number }>();
	return !!row;
}

// ---------------------------------------------------------- sms contexts

export async function getSmsContext(db: D1Database, phone: string): Promise<SmsContext | null> {
	const row = await db
		.prepare('SELECT owner_id, item_ids, sent_at FROM sms_contexts WHERE phone = ?')
		.bind(phone)
		.first<{ owner_id: string; item_ids: string; sent_at: number }>();
	if (!row) return null;
	return { ownerId: row.owner_id, itemIds: JSON.parse(row.item_ids), at: row.sent_at };
}

/** Saves (or with null, forgets) a phone's last list, clearing out stale ones. */
export async function saveSmsContext(db: D1Database, phone: string, context: SmsContext | null) {
	const stale = db
		.prepare('DELETE FROM sms_contexts WHERE sent_at < ?')
		.bind(Date.now() - CONTEXT_TTL);
	const write = context
		? db
				.prepare(
					`INSERT INTO sms_contexts (phone, owner_id, item_ids, sent_at) VALUES (?, ?, ?, ?)
					 ON CONFLICT (phone) DO UPDATE SET owner_id = excluded.owner_id,
					   item_ids = excluded.item_ids, sent_at = excluded.sent_at`
				)
				.bind(phone, context.ownerId, JSON.stringify(context.itemIds), context.at)
		: db.prepare('DELETE FROM sms_contexts WHERE phone = ?').bind(phone);
	await db.batch([stale, write]);
}

/** Dev sandbox only: forget every phone's last list. */
export async function clearSmsContexts(db: D1Database) {
	await db.prepare('DELETE FROM sms_contexts').run();
}

// ------------------------------------------------------------------ sizes

export async function listSizes(db: D1Database, personId: string): Promise<SizeRow[]> {
	const { results } = await db
		.prepare('SELECT * FROM sizes WHERE person_id = ? ORDER BY item COLLATE NOCASE')
		.bind(personId)
		.all<SizeRow>();
	return results;
}

/** Adds or changes a size. An existing item keeps the name it was saved with. */
export async function setSize(db: D1Database, personId: string, item: string, size: string) {
	await db
		.prepare(
			`INSERT INTO sizes (id, person_id, item, size) VALUES (?, ?, ?, ?)
			 ON CONFLICT (person_id, item COLLATE NOCASE)
			 DO UPDATE SET size = excluded.size, updated_at = datetime('now')`
		)
		.bind(crypto.randomUUID(), personId, item, size)
		.run();
}

/** Returns false if there was no such size. */
export async function removeSize(db: D1Database, personId: string, item: string) {
	const result = await db
		.prepare('DELETE FROM sizes WHERE person_id = ? AND item = ? COLLATE NOCASE')
		.bind(personId, item)
		.run();
	return result.meta.changes > 0;
}

/** Website edits, by row. The item can be renamed. */
export async function updateSize(
	db: D1Database,
	personId: string,
	id: string,
	item: string,
	size: string
) {
	await db
		.prepare(
			`UPDATE sizes SET item = ?, size = ?, updated_at = datetime('now')
			 WHERE id = ? AND person_id = ?`
		)
		.bind(item, size, id, personId)
		.run();
}

export async function removeSizeById(db: D1Database, personId: string, id: string) {
	await db.prepare('DELETE FROM sizes WHERE id = ? AND person_id = ?').bind(id, personId).run();
}
