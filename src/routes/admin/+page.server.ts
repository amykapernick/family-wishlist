import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	bumpSessionEpoch,
	clearAllAttempts,
	createGroup,
	createPeople,
	createPerson,
	deleteGroup,
	deletePerson,
	listAllRecommenders,
	listGroups,
	listGroupTokens,
	listLockouts,
	listMemberships,
	listPeople,
	listPersonData,
	renameGroup,
	renewGroupToken,
	setPersonAdmin,
	setPersonGroups,
	setPersonPin,
	setRecommenders,
	toPublicPerson,
	updatePerson
} from '#lib/server/db.ts';
import { requireAdmin, requiredText, text } from '#lib/server/guard.ts';
import { normalisePhone, parsePeopleLines } from '#lib/server/people.ts';
import { leavesNoAdmin, visibleIds } from '#lib/server/permissions.ts';
import { getEnv, setFamilyCookie } from '#lib/server/session.ts';

// Every load and action calls requireAdmin: a +layout guard would not
// protect form actions, which can be posted to directly.
//
// Admins manage the whole family, so this page works from everyone, not just
// the people the admin's groups let them see (identity.people).

async function everyone(db: D1Database) {
	return (await listPeople(db)).map(toPublicPerson);
}

async function personFromForm(db: D1Database, form: FormData) {
	const id = String(form.get('person') ?? '');
	const person = (await everyone(db)).find((p) => p.id === id);
	if (!person) error(404, 'No one by that name in this family.');
	return person;
}

/** The ticked groups, keeping only ones that exist. */
async function groupsFromForm(db: D1Database, form: FormData) {
	const ids = new Set((await listGroups(db)).map((g) => g.id));
	return [...new Set(form.getAll('group').map(String))].filter((id) => ids.has(id));
}

function groupName(form: FormData) {
	return requiredText(form, 'group_name', 'Group name', 60);
}

function isGroupNameTaken(e: unknown) {
	return e instanceof Error && /UNIQUE constraint failed: family_groups\.name/.test(e.message);
}

const groupNameTaken = () =>
	fail(400, { field: 'group_name', message: 'There’s already a group with that name.' });

export const load: PageServerLoad = async ({ locals }) => {
	const identity = requireAdmin(locals);
	const db = getEnv().DB;
	const [rows, groups, memberships, tokens] = await Promise.all([
		listPeople(db),
		listGroups(db),
		listMemberships(db),
		listGroupTokens(db)
	]);
	const nameOf = (id: string) => rows.find((p) => p.id === id)?.name ?? 'Unknown';
	const groupsOf = (personId: string) =>
		memberships.filter((m) => m.person_id === personId).map((m) => m.group_id);
	return {
		selfId: identity.self.id,
		groups: groups.map((g) => ({
			...g,
			members: memberships.filter((m) => m.group_id === g.id).length,
			link: `/join/group/${tokens[g.id]}`
		})),
		people: rows.map((row) => ({
			id: row.id,
			name: row.name,
			phone: row.phone,
			has_pin: row.pin_hash !== null,
			is_admin: row.is_admin === 1,
			groups: groupsOf(row.id)
		})),
		personData: await listPersonData(db),
		recommenders: await listAllRecommenders(db),
		// auth_attempts keys are `family:<ip>` or `person:<id>:<ip>`.
		lockouts: (await listLockouts(db)).map((key) => {
			const [kind, personId, ...ip] = key.split(':');
			return kind === 'person'
				? `${nameOf(personId)}’s PIN, from ${ip.join(':')}`
				: `Family PIN, from ${key.slice('family:'.length)}`;
		})
	};
};

function personFields(form: FormData) {
	const name = requiredText(form, 'name', 'Name', 80);
	if (name.error) return { error: name.error };
	const phone = normalisePhone(text(form, 'phone', 30));
	if (phone === 'invalid') {
		return {
			error: fail(400, {
				field: 'phone',
				message: 'Phone must be in international format, like +61400000000.'
			})
		};
	}
	return {
		fields: { name: name.value, phone },
		isAdmin: form.get('is_admin') === 'on'
	};
}

function isUniqueViolation(e: unknown) {
	return e instanceof Error && /UNIQUE constraint failed: people\.phone/.test(e.message);
}

const phoneTaken = () =>
	fail(400, { field: 'phone', message: 'Someone else already has that phone number.' });

export const actions: Actions = {
	addPerson: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const parsed = personFields(form);
		if (parsed.error) return parsed.error;
		try {
			const id = await createPerson(db, parsed.fields, { isAdmin: parsed.isAdmin });
			await setPersonGroups(db, id, await groupsFromForm(db, form));
		} catch (e) {
			if (isUniqueViolation(e)) return phoneTaken();
			throw e;
		}
		return {
			message: parsed.isAdmin
				? `Added ${parsed.fields.name} as an admin. They need to set a personal PIN before they can use admin.`
				: `Added ${parsed.fields.name}.`
		};
	},

	bulkAddPeople: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const text = String(form.get('people') ?? '');
		const lines = parsePeopleLines(text, await listPeople(db));
		const problems = lines.filter((l) => l.error);
		if (lines.length === 0) {
			return fail(400, {
				field: 'people',
				message: 'Add at least one person, one per line.',
				text
			});
		}
		if (problems.length > 0) {
			// Add no one until every line is right, so a fixed list can be resent as is.
			return fail(400, {
				field: 'people',
				message: `Nobody was added. Fix ${problems.length === 1 ? 'this line' : 'these lines'} and try again:`,
				problems: problems.map((l) => `Line ${l.line} (${l.text}): ${l.error}`),
				text
			});
		}
		const people = lines.map((l) => l.person!);
		try {
			await createPeople(db, people, await groupsFromForm(db, form));
		} catch (e) {
			if (isUniqueViolation(e)) {
				return fail(400, {
					field: 'people',
					message: 'Someone else already has one of those phone numbers. Nobody was added.',
					text
				});
			}
			throw e;
		}
		return {
			message: `Added ${people.length} family ${people.length === 1 ? 'member' : 'members'}.`
		};
	},

	updatePerson: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const person = await personFromForm(db, form);
		const parsed = personFields(form);
		if (parsed.error) return parsed.error;
		if (leavesNoAdmin(await everyone(db), { personId: person.id, isAdmin: parsed.isAdmin })) {
			return fail(400, {
				field: 'is_admin',
				message: 'Make someone else an admin (with a PIN) before removing the last one.'
			});
		}
		try {
			await updatePerson(db, person.id, parsed.fields);
		} catch (e) {
			if (isUniqueViolation(e)) return phoneTaken();
			throw e;
		}
		await setPersonAdmin(db, person.id, parsed.isAdmin);
		await setPersonGroups(db, person.id, await groupsFromForm(db, form));
		return { message: `Saved ${parsed.fields.name}.` };
	},

	resetPin: async (event) => {
		requireAdmin(event.locals);
		const person = await personFromForm(getEnv().DB, await event.request.formData());
		if (person.is_admin) {
			return fail(400, {
				field: 'pin',
				message: `${person.name} is an admin, and admins need a PIN. Remove their admin access first, or ask them to change it in Settings.`
			});
		}
		await setPersonPin(getEnv().DB, person.id, null);
		return { message: `Removed ${person.name}’s PIN. They can set a new one in Settings.` };
	},

	removePerson: async (event) => {
		const identity = requireAdmin(event.locals);
		const db = getEnv().DB;
		const person = await personFromForm(db, await event.request.formData());
		if (person.id === identity.self.id) {
			return fail(400, { field: 'person', message: 'You can’t remove yourself.' });
		}
		if (leavesNoAdmin(await everyone(db), { personId: person.id, removed: true })) {
			return fail(400, { field: 'person', message: 'You can’t remove the last admin.' });
		}
		await deletePerson(db, person.id);
		return { message: `Removed ${person.name} and their data.` };
	},

	setRecommenders: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const person = await personFromForm(db, form);
		// Recommenders must share a group with the person.
		const sharesGroup = visibleIds(person.id, await listMemberships(db));
		const ids = [...new Set(form.getAll('recommender').map(String))];
		if (ids.some((id) => id === person.id || !sharesGroup.has(id))) {
			return fail(400, {
				field: 'recommender',
				message: `Choose people who share a group with ${person.name}.`
			});
		}
		await setRecommenders(db, person.id, ids);
		return {
			message: ids.length
				? `Saved ${person.name}’s recommenders.`
				: `${person.name} has no recommenders now, so idea requests will go to them.`
		};
	},

	addGroup: async (event) => {
		requireAdmin(event.locals);
		const name = groupName(await event.request.formData());
		if (name.error) return name.error;
		try {
			await createGroup(getEnv().DB, name.value);
		} catch (e) {
			if (isGroupNameTaken(e)) return groupNameTaken();
			throw e;
		}
		return { message: `Added the ${name.value} group. Add people to it from their details below.` };
	},

	renameGroup: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const group = (await listGroups(db)).find((g) => g.id === form.get('group'));
		if (!group) error(404, 'That group no longer exists.');
		const name = groupName(form);
		if (name.error) return name.error;
		try {
			await renameGroup(db, group.id, name.value);
		} catch (e) {
			if (isGroupNameTaken(e)) return groupNameTaken();
			throw e;
		}
		return { message: `Renamed ${group.name} to ${name.value}.` };
	},

	renewGroupLink: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const group = (await listGroups(db)).find((g) => g.id === form.get('group'));
		if (!group) error(404, 'That group no longer exists.');
		await renewGroupToken(db, group.id);
		return { message: `Made a new link for ${group.name}. The old one no longer works.` };
	},

	deleteGroup: async (event) => {
		requireAdmin(event.locals);
		const db = getEnv().DB;
		const form = await event.request.formData();
		const group = (await listGroups(db)).find((g) => g.id === form.get('group'));
		if (!group) error(404, 'That group no longer exists.');
		await deleteGroup(db, group.id);
		return { message: `Deleted the ${group.name} group. Its members are still in the family.` };
	},

	signOutAll: async (event) => {
		requireAdmin(event.locals);
		const env = getEnv();
		const epoch = await bumpSessionEpoch(env.DB);
		// Keep this admin signed in on this device.
		await setFamilyCookie(event.cookies, env.COOKIE_SECRET, epoch);
		return {
			message:
				'Every other device is signed out. They’ll need the family link or PIN to get back in.'
		};
	},

	clearLockouts: async (event) => {
		requireAdmin(event.locals);
		await clearAllAttempts(getEnv().DB);
		return { message: 'Cleared all PIN lockouts.' };
	}
};
