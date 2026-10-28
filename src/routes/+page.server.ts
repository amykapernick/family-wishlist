import type { PageServerLoad } from './$types';
import { listAllItems } from '#lib/server/db.ts';
import { requireIdentity } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';
import { wishlistCount } from '#lib/server/spoilers.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const items = await listAllItems(getEnv().DB);
	return {
		people: identity.people.map((person) => ({
			...person,
			count: wishlistCount(identity.acting.id, person.id, items),
			isActing: person.id === identity.acting.id
		}))
	};
};
