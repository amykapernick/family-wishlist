import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { hashPin, verifyPin } from '#lib/server/crypto.ts';
import {
	clearAttempts,
	createPerson,
	getPerson,
	isThrottled,
	listPeople,
	recordFailedAttempt,
	toPublicPerson
} from '#lib/server/db.ts';
import {
	addUnlocked,
	clearIdentity,
	clientKey,
	getEnv,
	safeNext,
	setSelfCookie
} from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	return {
		people: (await listPeople(env.DB)).map(toPublicPerson),
		currentSelfId: event.locals.identity?.self.id ?? null,
		chosen: event.url.searchParams.get('as')
	};
};

export const actions: Actions = {
	choose: async (event) => {
		const env = getEnv();
		const form = await event.request.formData();
		const person = await getPerson(env.DB, String(form.get('person') ?? ''));
		if (!person) return fail(400, { message: 'Pick someone from the list.' });

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
		clearIdentity(event.cookies);
		redirect(303, '/whoami');
	}
};
