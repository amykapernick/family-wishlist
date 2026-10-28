import { describe, expect, it } from 'vitest';
import { hashPin, sign, timingSafeEqual, unsign, verifyPin } from './crypto.ts';

describe('PIN hashing', () => {
	it('verifies the right PIN and rejects others', async () => {
		const hash = await hashPin('1234');
		expect(hash).toMatch(/^pbkdf2\$100000\$/);
		expect(await verifyPin('1234', hash)).toBe(true);
		expect(await verifyPin('4321', hash)).toBe(false);
	});

	it('salts every hash', async () => {
		expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
	});

	it('rejects missing or malformed hashes', async () => {
		expect(await verifyPin('1234', null)).toBe(false);
		expect(await verifyPin('1234', 'plaintext')).toBe(false);
	});
});

describe('cookie signing', () => {
	it('round-trips a payload', async () => {
		expect(await unsign('secret', await sign('secret', 'p-alex'))).toBe('p-alex');
	});

	it('rejects tampering and the wrong secret', async () => {
		const signed = await sign('secret', 'p-alex');
		expect(await unsign('secret', signed.replace('p-alex', 'p-sam'))).toBeNull();
		expect(await unsign('other', signed)).toBeNull();
		expect(await unsign('secret', 'p-alex')).toBeNull();
		expect(await unsign('secret', undefined)).toBeNull();
	});
});

describe('timingSafeEqual', () => {
	it('compares strings of any length', () => {
		expect(timingSafeEqual('abc', 'abc')).toBe(true);
		expect(timingSafeEqual('abc', 'abd')).toBe(false);
		expect(timingSafeEqual('abc', 'abcd')).toBe(false);
		expect(timingSafeEqual('', 'a')).toBe(false);
	});
});
