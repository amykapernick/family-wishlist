import { describe, expect, it, vi } from 'vitest';
import { isFamilyPayloadValid } from './session.ts';

// session.ts imports cloudflare:workers, which only exists in the Workers runtime.
vi.mock('cloudflare:workers', () => ({ env: {} }));

const now = Date.UTC(2026, 9, 19);
const day = 24 * 60 * 60 * 1000;

describe('family cookie payload', () => {
	it('accepts a current-epoch cookie within a year', () => {
		expect(isFamilyPayloadValid(`v2:3:${now - day}`, '3', now)).toBe(true);
	});

	it('rejects cookies from before "sign out every device"', () => {
		expect(isFamilyPayloadValid(`v2:2:${now - day}`, '3', now)).toBe(false);
	});

	it('rejects cookies older than a year', () => {
		expect(isFamilyPayloadValid(`v2:3:${now - 366 * day}`, '3', now)).toBe(false);
	});

	it('treats pre-admin v1 cookies as epoch 1', () => {
		expect(isFamilyPayloadValid(`v1:${now - day}`, '1', now)).toBe(true);
		expect(isFamilyPayloadValid(`v1:${now - day}`, '2', now)).toBe(false);
	});

	it('rejects junk', () => {
		for (const junk of [null, '', 'v2:3', 'v3:3:1', 'v2:3:abc', 'p-alex']) {
			expect(isFamilyPayloadValid(junk, '3', now)).toBe(false);
		}
	});
});
