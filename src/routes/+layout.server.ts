import { dev } from '$app/env';
import type { LayoutServerLoad } from './$types';
import { listRequestsAsked } from '#lib/server/db.ts';
import { getEnv } from '#lib/server/session.ts';

export const load: LayoutServerLoad = async ({ locals }) => {
	// `npm run dev:live`: a warning on every page that changes are real.
	const liveDb = dev && (getEnv() as unknown as Record<string, unknown>).LIVE_DB === '1';
	const identity = locals.identity;
	if (!identity) return { identity: null, openRequests: 0, liveDb };
	const requests = await listRequestsAsked(getEnv().DB, identity.acting.id);
	return {
		identity: {
			self: identity.self,
			acting: identity.acting,
			actable: identity.actable,
			isAdmin: identity.isAdmin
		},
		openRequests: requests.filter((r) => r.status === 'open').length,
		liveDb
	};
};
