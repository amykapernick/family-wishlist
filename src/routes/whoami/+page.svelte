<script lang="ts">
	import { enhance } from '$app/forms';
	import Narrow from '#lib/components/layouts/Narrow/index.svelte';
	import PinField from '#lib/components/parts/PinField/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const chosenId = $derived(form?.chosen ?? data.chosen);
	const chosen = $derived(data.people.find((p) => p.id === chosenId && p.has_pin));
</script>

<svelte:head><title>Who are you? · Family Wishlist</title></svelte:head>

<Narrow>
	{#if chosen}
		<h1>Hi {chosen.name}</h1>
		<form method="POST" action="?/choose" use:enhance>
			<input type="hidden" name="person" value={chosen.id} />
			<PinField label="Your personal PIN" error={form?.message} autofocus />
			<div class={styles.actions}>
				<button type="submit">Continue</button>
				<a href="/whoami" class="btn secondary">Not {chosen.name}?</a>
			</div>
		</form>
	{:else}
		<h1>Who are you?</h1>
		<p>Pick yourself. This device will remember you.</p>
		{#if form?.message}<p class={styles.error} role="alert">{form.message}</p>{/if}
		<form method="POST" action="?/choose" use:enhance>
			<ul class={styles.people}>
				{#each data.people as person (person.id)}
					<li>
						<button
							type="submit"
							name="person"
							value={person.id}
							class={styles.person}
							aria-current={person.id === data.currentSelfId ? 'true' : undefined}
						>
							<span class={styles.avatar} aria-hidden="true">{person.name.slice(0, 1)}</span>
							<span>{person.name}</span>
							{#if person.has_pin}<span class={styles.hint}>PIN protected</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</form>
		{#if data.people.length === 0}
			<form method="POST" action="?/first" use:enhance>
				<p>
					No one is set up yet. Add yourself first. You’ll be the family admin, so you can add
					everyone else. Admins need a personal PIN.
				</p>
				<label for="first-name">Your name</label>
				<input id="first-name" name="name" required maxlength="80" autocomplete="given-name" />
				<PinField label="Your personal PIN (4 to 12 digits)" />
				<PinField label="Confirm PIN" name="confirm" />
				<button type="submit">Get started</button>
			</form>
		{/if}
		{#if data.currentSelfId}
			<p><a href="/">Back to the wishlists</a></p>
		{/if}
	{/if}
</Narrow>
