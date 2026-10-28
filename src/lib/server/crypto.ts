// PIN hashing (PBKDF2) and cookie signing (HMAC-SHA256) on WebCrypto.
// Works in Cloudflare Workers and Node >= 20, so the same code backs the
// app, the `hash-pin` script and the tests.

// Cloudflare Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Constant-time comparison so secrets can't be guessed byte by byte from timing. */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
	const x = typeof a === 'string' ? encoder.encode(a) : a;
	const y = typeof b === 'string' ? encoder.encode(b) : b;
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
	}
	return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		HASH_BYTES * 8
	);
	return new Uint8Array(bits);
}

/** Hash a PIN as `pbkdf2$<iterations>$<salt>$<hash>` with a fresh random salt. */
export async function hashPin(pin: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
	if (!stored) return false;
	const [scheme, iterations, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
	const actual = await pbkdf2(pin, fromBase64Url(salt), Number(iterations));
	return timingSafeEqual(actual, fromBase64Url(hash));
}

async function hmac(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

/** Returns `<payload>.<signature>`; the payload stays readable but tamper-evident. */
export async function sign(secret: string, payload: string): Promise<string> {
	return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the payload if the signature is valid, otherwise null. */
export async function unsign(secret: string, signed: string | undefined): Promise<string | null> {
	if (!signed) return null;
	const dot = signed.lastIndexOf('.');
	if (dot < 1) return null;
	const payload = signed.slice(0, dot);
	const expected = await hmac(secret, payload);
	return timingSafeEqual(expected, signed.slice(dot + 1)) ? payload : null;
}
