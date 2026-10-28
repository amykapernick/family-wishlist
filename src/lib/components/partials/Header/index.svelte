<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import Switch from '#lib/components/parts/Switch/index.svelte';
	import { theme, setTheme, type Theme } from '#lib/utils/theme.ts';
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
	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	// Positional, as in house's Switch: this order ties index 0/1 to a theme.
	const themeOptions: Theme[] = [`dark`, `light`];

	// The switch needs JavaScript, and the server can't know the stored theme,
	// so it only renders once mounted. Without JS the system theme applies.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
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

	{#if mounted}
		<Switch
			class={styles.theme}
			name="Colour mode"
			value={themeOptions.indexOf($theme)}
			toggleFunction={(index) => setTheme(themeOptions[index])}
			options={[
				{ label: 'Dark mode', icon: moon },
				{ label: 'Light mode', icon: sun }
			]}
		/>
	{/if}

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

{#snippet moon()}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
	</svg>
{/snippet}

{#snippet sun()}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="5" fill="currentColor" />
		<g stroke="currentColor" stroke-width="2" stroke-linecap="round">
			<path
				d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
			/>
		</g>
	</svg>
{/snippet}
