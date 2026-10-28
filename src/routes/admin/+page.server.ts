import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	bumpSessionEpoch,
	clearAllAttempts,
	createPeople,
	createPerson,
	deletePerson,
	listAllRecommenders,
	listLockouts,
	listPeople,
	listPersonData,
	setPersonAdmin,
	setPersonPin,
	setRecommenders,
	updatePerson
} from '#lib/server/db.ts';
import { findPerson, requireAdmin, requiredText, text } from '#lib/server/guard.ts';
import { normalisePhone, parsePeopleLines } from '#lib/server/people.ts';
import { leavesNoAdmin } from '#lib/server/permissions.ts';
import { getEnv, setFamilyCookie } from '#lib/server/session.ts';

// Every load and action calls requireAdmin: a +layout guard would not
// protect form actions, which can be posted to directly.

export const load: PageServerLoad = async ({ locals }) => {
	const identity = requireAdmin(locals);
	const db = getEnv().DB;
	const nameOf = (id: string) => identity.people.find((p) => p.id === id)?.name ?? 'Unknown';
	return {
		selfId: identity.self.id,
		people: (await listPeople(db)).map((row) => ({
			id: row.id,
			name: row.name,
			phone: row.phone,
			has_pin: row.pin_hash !== null,
			is_admin: row.is_admin === 1
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
		const parsed = personFields(await event.request.formData());
		if (parsed.error) return parsed.error;
		try {
			await createPerson(getEnv().DB, parsed.fields, { isAdmin: parsed.isAdmin });
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
		const text = String((await event.request.formData()).get('people') ?? '');
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
			await createPeople(db, people);
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
		const identity = requireAdmin(event.locals);
		const form = await event.request.formData();
		const person = findPerson(identity, String(form.get('person') ?? ''));
		const parsed = personFields(form);
		if (parsed.error) return parsed.error;
		if (leavesNoAdmin(identity.people, { personId: person.id, isAdmin: parsed.isAdmin })) {
			return fail(400, {
				field: 'is_admin',
				message: 'Make someone else an admin (with a PIN) before removing the last one.'
			});
		}
		const db = getEnv().DB;
		try {
			await updatePerson(db, person.id, parsed.fields);
		} catch (e) {
			if (isUniqueViolation(e)) return phoneTaken();
			throw e;
		}
		await setPersonAdmin(db, person.id, parsed.isAdmin);
		return { message: `Saved ${parsed.fields.name}.` };
	},

	resetPin: async (event) => {
		const identity = requireAdmin(event.locals);
		const person = findPerson(identity, String((await event.request.formData()).get('person')));
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
		const person = findPerson(identity, String((await event.request.formData()).get('person')));
		if (person.id === identity.self.id) {
			return fail(400, { field: 'person', message: 'You can’t remove yourself.' });
		}
		if (leavesNoAdmin(identity.people, { personId: person.id, removed: true })) {
			return fail(400, { field: 'person', message: 'You can’t remove the last admin.' });
		}
		await deletePerson(getEnv().DB, person.id);
		return { message: `Removed ${person.name} and their data.` };
	},

	setRecommenders: async (event) => {
		const identity = requireAdmin(event.locals);
		const form = await event.request.formData();
		const person = findPerson(identity, String(form.get('person') ?? ''));
		const ids = [...new Set(form.getAll('recommender').map(String))];
		if (ids.some((id) => id === person.id || !identity.people.some((p) => p.id === id))) {
			return fail(400, { field: 'recommender', message: 'Choose people from the family.' });
		}
		await setRecommenders(getEnv().DB, person.id, ids);
		return {
			message: ids.length
				? `Saved ${person.name}’s recommenders.`
				: `${person.name} has no recommenders now, so idea requests will go to them.`
		};
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
