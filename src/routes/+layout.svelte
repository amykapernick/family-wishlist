<script lang="ts">
	import '#lib/styles/main.css';
	import favicon from '#lib/assets/favicon.svg';
	import Header from '#lib/components/partials/Header/index.svelte';
	import type { LayoutProps } from './$types';
	import styles from './+layout.module.css';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class={styles.skip} href="#main">Skip to content</a>

{#if data.liveDb}
	<p class={styles.liveDb}>
		<strong>Live database.</strong> This is dev mode, but every change goes to the real family’s data.
	</p>
{/if}

<div class={[styles.app, data.identity && styles.signedIn]}>
	{#if data.identity}
		<Header identity={data.identity} openRequests={data.openRequests} />
	{/if}

	<main id="main" tabindex="-1" class={styles.main}>
		{#if data.identity && data.identity.acting.id !== data.identity.self.id}
			<p class={styles.acting} role="status">
				You are acting as <strong>{data.identity.acting.name}</strong>. Changes are made on their
				behalf.
			</p>
		{/if}
		{@render children()}
	</main>
</div>
