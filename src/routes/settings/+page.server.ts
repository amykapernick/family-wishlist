import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { hashPin, verifyPin } from '#lib/server/crypto.ts';
import {
	getPerson,
	listMemberships,
	listPeople,
	listRecommenders,
	setPersonPin,
	setRecommenders
} from '#lib/server/db.ts';
import { findPerson, requireIdentity } from '#lib/server/guard.ts';
import { canManagePin, canManageRecommenders, visibleIds } from '#lib/server/permissions.ts';
import { addUnlocked, getEnv } from '#lib/server/session.ts';

/** People who can recommend for `personId`: anyone you can see who shares a group with them. */
async function recommenderChoices(identity: App.Identity, personId: string) {
	const sharesGroup = visibleIds(personId, await listMemberships(getEnv().DB));
	return identity.people.filter((p) => p.id !== personId && sharesGroup.has(p.id));
}

export const load: PageServerLoad = async ({ locals }) => {
	const identity = requireIdentity(locals);
	const db = getEnv().DB;
	const [recommenders, everyone, choices] = await Promise.all([
		listRecommenders(db, identity.acting.id),
		listPeople(db),
		recommenderChoices(identity, identity.acting.id)
	]);
	return {
		acting: identity.acting,
		recommenderOptions: choices.map((p) => ({
			id: p.id,
			name: p.name,
			chosen: recommenders.includes(p.id)
		})),
		isAdmin: identity.isAdmin,
		// Across the whole family: the admin may be in another group.
		hasAdmin: everyone.some((p) => p.is_admin === 1 && p.pin_hash !== null)
	};
};

export const actions: Actions = {
	setRecommenders: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const person = findPerson(identity, String(form.get('person') ?? ''));
		if (!canManageRecommenders(identity.acting.id, person.id)) {
			error(403, 'Switch to acting as this person to choose their recommenders.');
		}
		const ids = [...new Set(form.getAll('recommender').map(String))];
		const choices = await recommenderChoices(identity, person.id);
		if (ids.some((id) => !choices.some((p) => p.id === id))) {
			return fail(400, {
				field: 'recommender',
				message: `Choose people who share a group with ${person.name}.`
			});
		}
		await setRecommenders(getEnv().DB, person.id, ids);
		return {
			message: ids.length
				? `Saved ${person.name}’s recommenders.`
				: `${person.name} has no recommenders now, so idea requests will go to them.`
		};
	},

	setPin: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const person = findPerson(identity, String(form.get('person') ?? ''));
		if (!canManagePin(identity.acting.id, person.id)) {
			error(403, 'Switch to acting as this person to change their PIN.');
		}
		const pin = String(form.get('pin') ?? '');
		if (!/^\d{4,12}$/.test(pin)) {
			return fail(400, { field: 'pin', message: 'PIN must be 4 to 12 digits.' });
		}
		if (pin !== form.get('confirm')) {
			return fail(400, { field: 'confirm', message: 'The two PINs don’t match.' });
		}
		const env = getEnv();
		const row = await getPerson(env.DB, person.id);
		if (row?.pin_hash && !(await verifyPin(String(form.get('current') ?? ''), row.pin_hash))) {
			return fail(400, { field: 'current', message: 'Your current PIN is not right.' });
		}
		await setPersonPin(env.DB, person.id, await hashPin(pin));
		// They just proved who they are, so don't ask for the new PIN straight away.
		await addUnlocked(event.cookies, env.COOKIE_SECRET, person.id);
		return {
			message: person.is_admin
				? `PIN saved for ${person.name}. Admin access is active.`
				: `PIN saved for ${person.name}.`
		};
	},

	clearPin: async (event) => {
		const identity = requireIdentity(event.locals);
		const form = await event.request.formData();
		const person = findPerson(identity, String(form.get('person') ?? ''));
		if (!canManagePin(identity.acting.id, person.id)) {
			error(403, 'Switch to acting as this person to change their PIN.');
		}
		if (person.is_admin) {
			return fail(400, {
				field: 'current',
				message: 'Admins need a PIN. Ask another admin to remove your admin access first.'
			});
		}
		const db = getEnv().DB;
		const row = await getPerson(db, person.id);
		if (row?.pin_hash && !(await verifyPin(String(form.get('current') ?? ''), row.pin_hash))) {
			return fail(400, { field: 'current', message: 'Your current PIN is not right.' });
		}
		await setPersonPin(db, person.id, null);
		return { message: `PIN removed for ${person.name}.` };
	}
};
