// Usage: npm run hash-pin -- 1234
// Prints a PBKDF2 hash for FAMILY_PIN_HASH (or for seeding a personal PIN).
import { hashPin } from '../src/lib/server/crypto.ts';

const pin = process.argv[2];
if (!pin || !/^\d{4,12}$/.test(pin)) {
	console.error('Usage: npm run hash-pin -- <4-12 digit PIN>');
	process.exit(1);
}
console.log(await hashPin(pin));
