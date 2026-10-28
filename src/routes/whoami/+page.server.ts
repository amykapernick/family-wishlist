import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { hashPin, verifyPin } from '#lib/server/crypto.ts';
import {
	clearAttempts,
	createPerson,
	getPerson,
	isThrottled,
	listGroups,
	listMemberships,
	listPeople,
	recordFailedAttempt,
	toPublicPerson
} from '#lib/server/db.ts';
import {
	addUnlocked,
	clientKey,
	forgetIdentity,
	getEnv,
	getGroupId,
	getRememberedId,
	safeNext,
	setSelfCookie
} from '#lib/server/session.ts';

/** Picks the "not in a group" option, for people with no group. */
const NO_GROUP = 'none';

/**
 * Who this device can choose from: everyone, or only one group's people if it
 * came in through that group's link (fw_group).
 */
async function loginScope(db: D1Database, cookies: Cookies, secret: string) {
	const [rows, groups, memberships] = await Promise.all([
		listPeople(db),
		listGroups(db),
		listMemberships(db)
	]);
	const groupIdsOf = (personId: string) =>
		memberships.filter((m) => m.person_id === personId).map((m) => m.group_id);
	const linkId = await getGroupId(cookies, secret);
	const linkGroup = groups.find((g) => g.id === linkId) ?? null;
	const inScope = (personId: string) => !linkGroup || groupIdsOf(personId).includes(linkGroup.id);
	return { rows, groups, groupIdsOf, linkGroup, inScope };
}

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const { url } = event;
	const { rows, groups, groupIdsOf, linkGroup, inScope } = await loginScope(
		env.DB,
		event.cookies,
		env.COOKIE_SECRET
	);
	// "Log in as admin" (from Settings) lists only people with admin access.
	const adminsOnly = url.searchParams.get('only') === 'admins';
	const choosable = rows.filter(
		(p) => inScope(p.id) && (!adminsOnly || (p.is_admin === 1 && p.pin_hash !== null))
	);
	let chosen = url.searchParams.get('as');
	if (!choosable.some((p) => p.id === chosen)) chosen = null;

	// Signed out but this device remembers who they are: don't ask again.
	// Someone without a PIN goes straight back in; someone with one just
	// gets their PIN prompt.
	if (!event.locals.identity && !chosen && !adminsOnly) {
		const rememberedId = await getRememberedId(event.cookies, env.COOKIE_SECRET);
		const remembered = choosable.find((p) => p.id === rememberedId);
		if (remembered && !remembered.pin_hash) {
			await setSelfCookie(event.cookies, env.COOKIE_SECRET, remembered.id, false);
			redirect(303, safeNext(url.searchParams.get('next')));
		}
		if (remembered) chosen = remembered.id;
	}

	// The whole family picks their group first, then themselves; a group link
	// (or admin login) goes straight to people. Groups with no one choosable
	// aren't offered, and people with no group get their own option.
	const options = [
		...groups
			.map((g) => ({ id: g.id, name: g.name }))
			.filter((g) => choosable.some((p) => groupIdsOf(p.id).includes(g.id))),
		...(choosable.some((p) => groupIdsOf(p.id).length === 0)
			? [{ id: NO_GROUP, name: 'Not in a group' }]
			: [])
	];
	const pickGroup = !linkGroup && !adminsOnly && options.length > 1;
	const group = pickGroup ? options.find((g) => g.id === url.searchParams.get('group')) : null;
	const people =
		pickGroup && !group
			? []
			: choosable.filter((p) =>
					!group
						? true
						: group.id === NO_GROUP
							? groupIdsOf(p.id).length === 0
							: groupIdsOf(p.id).includes(group.id)
				);

	return {
		step: pickGroup && !group && !chosen ? ('groups' as const) : ('people' as const),
		groups: pickGroup ? options : [],
		group: group?.name ?? linkGroup?.name ?? null,
		canChangeGroup: pickGroup,
		people: people.map(toPublicPerson),
		// The PIN prompt (`chosen`) can be for a remembered person outside the listed group.
		chosenPerson: chosen ? toPublicPerson(choosable.find((p) => p.id === chosen)!) : null,
		currentSelfId: event.locals.identity?.self.id ?? null,
		adminsOnly,
		familyIsEmpty: rows.length === 0,
		next: url.searchParams.get('next')
	};
};

export const actions: Actions = {
	choose: async (event) => {
		const env = getEnv();
		const form = await event.request.formData();
		const person = await getPerson(env.DB, String(form.get('person') ?? ''));
		// A group link's device can only choose that group's people.
		const { inScope } = await loginScope(env.DB, event.cookies, env.COOKIE_SECRET);
		if (!person || !inScope(person.id))
			return fail(400, { message: 'Pick someone from the list.' });

		if (person.pin_hash) {
			const key = `person:${person.id}:${clientKey(event)}`;
			if (await isThrottled(env.DB, key)) {
				return fail(429, {
					chosen: person.id,
					message: 'Too many attempts. Please wait 15 minutes and try again.'
				});
			}
			const pin = form.get('pin');
			if (typeof pin !== 'string' || pin === '') {
				return fail(400, { chosen: person.id, message: null });
			}
			if (!(await verifyPin(pin, person.pin_hash))) {
				await recordFailedAttempt(env.DB, key);
				return fail(400, { chosen: person.id, message: 'That PIN is not right.' });
			}
			await clearAttempts(env.DB, key);
			await addUnlocked(event.cookies, env.COOKIE_SECRET, person.id);
		}

		await setSelfCookie(event.cookies, env.COOKIE_SECRET, person.id, person.pin_hash !== null);
		redirect(303, safeNext(event.url.searchParams.get('next')));
	},

	/**
	 * Bootstrap: only works while the family has no one in it yet. The first
	 * person becomes the admin, and admins need a PIN.
	 */
	first: async (event) => {
		const env = getEnv();
		if ((await listPeople(env.DB)).length > 0) {
			return fail(409, { message: 'Your family is already set up. Pick yourself below.' });
		}
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 80);
		if (!name) return fail(400, { message: 'Enter your name.' });
		const pin = String(form.get('pin') ?? '');
		if (!/^\d{4,12}$/.test(pin)) return fail(400, { message: 'PIN must be 4 to 12 digits.' });
		if (pin !== form.get('confirm')) return fail(400, { message: 'The two PINs don’t match.' });
		const id = await createPerson(
			env.DB,
			{ name, phone: null },
			{ isAdmin: true, pinHash: await hashPin(pin) }
		);
		await addUnlocked(event.cookies, env.COOKIE_SECRET, id);
		await setSelfCookie(event.cookies, env.COOKIE_SECRET, id, true);
		redirect(303, '/admin');
	},

	forget: async (event) => {
		forgetIdentity(event.cookies);
		redirect(303, '/whoami');
	}
};
