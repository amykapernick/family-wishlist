// Helpers for load functions and actions behind hooks.server.ts.

import { error, fail } from '@sveltejs/kit';
import type { PublicPerson } from '#lib/types.ts';
import { claimantIds } from './permissions.ts';

export function requireIdentity(locals: App.Locals): App.Identity {
	if (!locals.identity) error(401, 'Choose who you are first.');
	return locals.identity;
}

/** Every admin load and action calls this; layout guards don't protect actions. */
export function requireAdmin(locals: App.Locals): App.Identity {
	const identity = requireIdentity(locals);
	if (!identity.isAdmin) error(403, 'Only a family admin can do that.');
	return identity;
}

export function findPerson(identity: App.Identity, id: string): PublicPerson {
	const person = identity.people.find((p) => p.id === id);
	if (!person) error(404, 'No one by that name in this family.');
	return person;
}

/** Whose claims this browser can release (see permissions.claimantIds). */
export function claimantIdList(identity: App.Identity): string[] {
	return claimantIds(identity.self.id, identity.acting.id);
}

/** Trimmed text field, or null when blank. */
export function text(form: FormData, name: string, max = 500): string | null {
	const value = form.get(name);
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().slice(0, max);
	return trimmed === '' ? null : trimmed;
}

export function requiredText(form: FormData, name: string, label: string, max = 500) {
	const value = text(form, name, max);
	if (!value) return { error: fail(400, { field: name, message: `${label} is required.` }) };
	return { value };
}

/** Only http(s) links, so a stored URL can't become a javascript: link. */
export function safeUrl(form: FormData, name: string) {
	const value = text(form, name, 2000);
	if (!value) return { value: null };
	try {
		const url = new URL(value);
		if (url.protocol === 'http:' || url.protocol === 'https:') return { value: url.toString() };
	} catch {
		// fall through
	}
	return {
		error: fail(400, { field: name, message: 'Link must start with http:// or https://.' })
	};
}
