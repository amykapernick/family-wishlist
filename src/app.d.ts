// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { PublicPerson } from '#lib/types.ts';

declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			/** Set by hooks.server.ts on every authenticated route. */
			identity: Identity | null;
		}

		interface Identity {
			self: PublicPerson;
			acting: PublicPerson;
			/** Everyone `self` can act as (self first, then the family), and whether a PIN is still needed. */
			actable: (PublicPerson & { locked: boolean })[];
			/** Everyone in the family, for name lookups and pickers. */
			people: PublicPerson[];
			/** `self` is an admin with a PIN (see permissions.hasAdminAccess). */
			isAdmin: boolean;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
