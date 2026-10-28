// Signed cookies for the three layers of identity:
//   fw_family  - this browser got in via the family link or PIN (1 year,
//                or until an admin signs out every device)
//   fw_self    - which person this browser belongs to
//   fw_acting  - who they are acting as right now (browser session)
// plus fw_unlocked, the personal PINs verified this browser session, and
// fw_remember, who last chose themselves here (1 year, outlives the others).

import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { sign, unsign } from './crypto.ts';

const YEAR = 60 * 60 * 24 * 365;

export const COOKIE = {
	family: 'fw_family',
	self: 'fw_self',
	acting: 'fw_acting',
	unlocked: 'fw_unlocked',
	remember: 'fw_remember'
} as const;

type CookieName = (typeof COOKIE)[keyof typeof COOKIE];

const base = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' } as const;

/** Bindings and secrets from wrangler.jsonc and `wrangler secret` (or .dev.vars locally). */
export function getEnv(): Env {
	if (!env.DB || !env.COOKIE_SECRET) {
		error(500, 'Server is missing its DB binding or secrets. See README "Local development".');
	}
	return env;
}

async function setSigned(
	cookies: Cookies,
	secret: string,
	name: CookieName,
	value: string,
	maxAge?: number
) {
	cookies.set(name, await sign(secret, value), maxAge ? { ...base, maxAge } : base);
}

async function getSigned(cookies: Cookies, secret: string, name: CookieName) {
	return unsign(secret, cookies.get(name));
}

export async function setFamilyCookie(cookies: Cookies, secret: string, epoch: string) {
	await setSigned(cookies, secret, COOKIE.family, `v2:${epoch}:${Date.now()}`, YEAR);
}

/**
 * Checks a (verified) family cookie payload: `v2:<epoch>:<issued ms>`.
 * Cookies from before admin support (`v1:<issued ms>`) count as epoch 1.
 */
export function isFamilyPayloadValid(payload: string | null, epoch: string, now = Date.now()) {
	if (!payload) return false;
	const parts = payload.split(':');
	const [version] = parts;
	const [cookieEpoch, issuedText] =
		version === 'v2' && parts.length === 3
			? [parts[1], parts[2]]
			: version === 'v1' && parts.length === 2
				? ['1', parts[1]]
				: [null, null];
	if (cookieEpoch !== epoch) return false;
	const issued = Number(issuedText);
	return Number.isFinite(issued) && now - issued < YEAR * 1000;
}

export async function hasFamilyCookie(
	cookies: Cookies,
	secret: string,
	epoch: string
): Promise<boolean> {
	return isFamilyPayloadValid(await getSigned(cookies, secret, COOKIE.family), epoch);
}

/**
 * A PIN-protected person's self cookie only lasts the browser session, so a
 * shared device doesn't stay signed in as them for a year. The device still
 * remembers who they are (fw_remember), so next time it asks only for the PIN.
 */
export async function setSelfCookie(
	cookies: Cookies,
	secret: string,
	personId: string,
	hasPin: boolean
) {
	await setSigned(cookies, secret, COOKIE.self, personId, hasPin ? undefined : YEAR);
	await setSigned(cookies, secret, COOKIE.remember, personId, YEAR);
	cookies.delete(COOKIE.acting, { path: '/' });
}

/** Who last chose themselves on this device, even after being signed out. */
export async function getRememberedId(cookies: Cookies, secret: string) {
	return getSigned(cookies, secret, COOKIE.remember);
}

export async function getSelfId(cookies: Cookies, secret: string) {
	return getSigned(cookies, secret, COOKIE.self);
}

export async function setActingCookie(cookies: Cookies, secret: string, personId: string) {
	await setSigned(cookies, secret, COOKIE.acting, personId);
}

export async function getActingId(cookies: Cookies, secret: string) {
	return getSigned(cookies, secret, COOKIE.acting);
}

export async function getUnlocked(cookies: Cookies, secret: string): Promise<string[]> {
	const value = await getSigned(cookies, secret, COOKIE.unlocked);
	return value ? value.split(',').filter(Boolean) : [];
}

export async function addUnlocked(cookies: Cookies, secret: string, personId: string) {
	const unlocked = new Set(await getUnlocked(cookies, secret));
	unlocked.add(personId);
	await setSigned(cookies, secret, COOKIE.unlocked, [...unlocked].join(','));
}

/** Signs out of the current person but keeps fw_remember, so /whoami can default back to them. */
export function clearIdentity(cookies: Cookies) {
	for (const name of [COOKIE.self, COOKIE.acting, COOKIE.unlocked]) {
		cookies.delete(name, { path: '/' });
	}
}

/** "Not you?": also forget who this device belongs to, so /whoami shows everyone. */
export function forgetIdentity(cookies: Cookies) {
	clearIdentity(cookies);
	cookies.delete(COOKIE.remember, { path: '/' });
}

export function clientKey(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): string {
	return event.request.headers.get('cf-connecting-ip') ?? event.getClientAddress();
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
