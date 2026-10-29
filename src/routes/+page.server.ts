import type { PageServerLoad } from './$types';
import { listAllItems, listGroups, listMemberships } from '#lib/server/db.ts';
import { requireIdentity } from '#lib/server/guard.ts';
import { getEnv } from '#lib/server/session.ts';
import { wishlistCount } from '#lib/server/spoilers.ts';

export const load: PageServerLoad = async (event) => {
	const identity = requireIdentity(event.locals);
	const db = getEnv().DB;
	const [items, groups, memberships] = await Promise.all([
		listAllItems(db),
		listGroups(db),
		listMemberships(db)
	]);
	const people = identity.people.map((person) => ({
		...person,
		count: wishlistCount(identity.acting.id, person.id, items, identity.self.id),
		isActing: person.id === identity.acting.id
	}));
	// Someone in several groups sees a section per group (a person in two of
	// them shows in both); otherwise one list.
	const mine = groups.filter((g) =>
		memberships.some((m) => m.group_id === g.id && m.person_id === identity.self.id)
	);
	const sections =
		mine.length > 1
			? mine.map((g) => ({
					id: g.id,
					name: g.name as string | null,
					people: people.filter((p) =>
						memberships.some((m) => m.group_id === g.id && m.person_id === p.id)
					)
				}))
			: [{ id: 'everyone', name: null, people }];
	return { sections, isEmpty: people.length === 0 };
};
