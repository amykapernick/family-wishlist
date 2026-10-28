<script lang="ts">
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import styles from './index.module.css';

	let {
		identity,
		openRequests
	}: {
		identity: {
			self: { id: string; name: string };
			acting: { id: string; name: string };
			actable: { id: string; name: string; locked: boolean }[];
			isAdmin: boolean;
		};
		openRequests: number;
	} = $props();

	const here = $derived(page.url.pathname + page.url.search);
	const nav = $derived([
		{ href: '/', label: 'Wishlists' },
		{ href: '/requests', label: 'Requests' },
		{ href: '/settings', label: 'Settings' },
		...(identity.isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
		...(dev ? [{ href: '/dev/sms', label: 'SMS preview' }] : [])
	]);
	// Wishlists stays selected on each person's list and its sub-pages.
	const current = (href: string) =>
		href === '/'
			? page.url.pathname === '/' || page.url.pathname.startsWith('/people/')
			: page.url.pathname.startsWith(href);
</script>

<header class={styles.header}>
	<a href="/" class={styles.title}>
		<svg viewBox="0 0 32 32" aria-hidden="true">
			<rect x="4" y="13" width="24" height="16" rx="2" fill="currentColor" />
			<rect x="2" y="8" width="28" height="7" rx="2" fill="currentColor" opacity="0.8" />
			<rect x="14" y="8" width="4" height="21" fill="var(--yellow)" />
		</svg>
		<span>Family Wishlist</span>
	</a>

	<form method="POST" action="/acting" class={styles.acting}>
		<input type="hidden" name="next" value={here} />
		<label for="acting-as">Acting as</label>
		<select id="acting-as" name="to" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			{#each identity.actable as person (person.id)}
				<option value={person.id} selected={person.id === identity.acting.id}>
					{person.name}{person.id === identity.self.id ? ' (you)' : ''}{person.locked ? ' 🔒' : ''}
				</option>
			{/each}
		</select>
		<noscript><button type="submit" class="secondary">Switch</button></noscript>
	</form>

	<nav class={styles.menu} aria-label="Main">
		<ul>
			{#each nav as link (link.href)}
				<li>
					<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>
						{link.label}
						{#if link.href === '/requests' && openRequests > 0}
							<span class={styles.badge}>
								{openRequests}<span class="sr-only"> open</span>
							</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<form method="POST" action="/whoami?/forget" class={styles.profile}>
		<span>Signed in as {identity.self.name}.</span>
		<button type="submit" class="text">Not you?</button>
	</form>
</header>
