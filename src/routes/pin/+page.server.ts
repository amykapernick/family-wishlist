import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyPin } from '#lib/server/crypto.ts';
import {
	clearAttempts,
	getSessionEpoch,
	isThrottled,
	recordFailedAttempt
} from '#lib/server/db.ts';
import {
	clearGroupCookie,
	clientKey,
	getEnv,
	hasFamilyCookie,
	safeNext,
	setFamilyCookie
} from '#lib/server/session.ts';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	if (await hasFamilyCookie(event.cookies, env.COOKIE_SECRET, await getSessionEpoch(env.DB))) {
		redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};

export const actions: Actions = {
	default: async (event) => {
		const env = getEnv();
		const key = `family:${clientKey(event)}`;
		if (await isThrottled(env.DB, key)) {
			return fail(429, { message: 'Too many attempts. Please wait 15 minutes and try again.' });
		}
		const pin = String((await event.request.formData()).get('pin') ?? '');
		if (!(await verifyPin(pin, env.FAMILY_PIN_HASH))) {
			await recordFailedAttempt(env.DB, key);
			return fail(400, { message: 'That PIN is not right. Please try again.' });
		}
		await clearAttempts(env.DB, key);
		await setFamilyCookie(event.cookies, env.COOKIE_SECRET, await getSessionEpoch(env.DB));
		// Like the family link, the family PIN offers every group.
		clearGroupCookie(event.cookies);
		redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};
