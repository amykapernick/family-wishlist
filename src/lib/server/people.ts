// Adding family members: phone numbers, and the admin's bulk "name number" list.

export const MAX_NAME = 80;
const MAX_PEOPLE = 50;

/**
 * Strips spaces, brackets and dashes. Returns null for blank, or 'invalid'
 * when it isn't international format (+61400000000).
 */
export function normalisePhone(raw: string | null): string | null | 'invalid' {
	const phone = raw?.replace(/[\s()-]/g, '') ?? '';
	if (!phone) return null;
	return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : 'invalid';
}

export interface NewPerson {
	name: string;
	phone: string | null;
}

export interface PeopleLine {
	line: number;
	text: string;
	person?: NewPerson;
	error?: string;
}

/** A number at the end of a line: "+61 400 000 001", "(+61) 400-000-001", "0400000001". */
const TRAILING_NUMBER = /[\s,;:]+([+(\d][+\d\s()-]*\d)\s*$/;
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * One person per line, name then mobile ("Grandma June +61400000003"). The
 * mobile is optional. `existing` (names and phones already in the family)
 * and repeats within the list are reported as errors, line by line.
 */
export function parsePeopleLines(
	text: string,
	existing: readonly { name: string; phone: string | null }[] = []
): PeopleLine[] {
	const names = new Set(existing.map((p) => p.name.toLowerCase()));
	const phones = new Set(existing.map((p) => p.phone).filter(Boolean));
	const lines: PeopleLine[] = [];
	for (const [index, raw] of text.split(/\r?\n/).entries()) {
		const textLine = raw.trim();
		if (!textLine) continue;
		const entry: PeopleLine = { line: index + 1, text: textLine };
		lines.push(entry);
		if (lines.length > MAX_PEOPLE) {
			entry.error = `Only ${MAX_PEOPLE} people at a time.`;
			continue;
		}

		let rest = textLine.replace(LIST_MARKER, '');
		let phone: string | null = null;
		const match = TRAILING_NUMBER.exec(` ${rest}`);
		// A short number ("Leo 2") is part of the name.
		if (match && match[1].replace(/\D/g, '').length >= 6) {
			const normalised = normalisePhone(match[1]);
			if (normalised === 'invalid') {
				entry.error = `“${match[1].trim()}” isn’t an international number, like +61400000000.`;
				continue;
			}
			phone = normalised;
			rest = ` ${rest}`.slice(0, match.index);
		} else if (/\d{6,}/.test(rest.replace(/[\s()-]/g, ''))) {
			entry.error = 'Put the number at the end, in international format, like +61400000000.';
			continue;
		}

		const name = rest
			.replace(/\s+/g, ' ')
			.replace(/[\s,;:]+$/, '')
			.trim();
		if (!name) {
			entry.error = 'Needs a name before the number.';
		} else if (name.length > MAX_NAME) {
			entry.error = `Names can be up to ${MAX_NAME} characters.`;
		} else if (names.has(name.toLowerCase())) {
			entry.error = `${name} is already in the family.`;
		} else if (phone && phones.has(phone)) {
			entry.error = `Someone already has ${phone}.`;
		} else {
			names.add(name.toLowerCase());
			if (phone) phones.add(phone);
			entry.person = { name, phone };
		}
	}
	return lines;
}
