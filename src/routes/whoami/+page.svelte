<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Narrow from '#lib/components/layouts/Narrow/index.svelte';
	import PinField from '#lib/components/parts/PinField/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const chosenId = $derived(form?.chosen ?? data.chosenPerson?.id);
	const chosen = $derived(
		[...data.people, ...(data.chosenPerson ? [data.chosenPerson] : [])].find(
			(p) => p.id === chosenId && p.has_pin
		)
	);
	/** This page with a different group (or none, to pick again), keeping `next`. */
	const groupHref = (group: string | null) => {
		const params = new URLSearchParams();
		if (group) params.set('group', group);
		if (data.next) params.set('next', data.next);
		return `/whoami${params.size ? `?${params}` : ''}`;
	};
	// Keep this page's query (group, next, …) on the form posts: a PIN prompt
	// reloads the page from the post's address, and the group must survive it.
	const chooseAction = $derived(
		page.url.search ? `?/choose&${page.url.search.slice(1)}` : '?/choose'
	);
</script>

<svelte:head
	><title>{data.adminsOnly ? 'Log in as admin' : 'Who are you?'} · Family Wishlist</title
	></svelte:head
>

<Narrow>
	{#if chosen}
		<h1>Hi {chosen.name}</h1>
		<form method="POST" action={chooseAction} use:enhance>
			<input type="hidden" name="person" value={chosen.id} />
			<PinField label="Your personal PIN" error={form?.message} autofocus />
			<div class={styles.actions}>
				<button type="submit">Continue</button>
				<button type="submit" formaction="?/forget" formnovalidate class="secondary">
					Not {chosen.name}?
				</button>
			</div>
		</form>
	{:else if data.step === 'groups'}
		<h1>Who are you?</h1>
		<p>First, which part of the family are you in?</p>
		<ul class={styles.people}>
			{#each data.groups as group (group.id)}
				<li><a class={styles.person} href={groupHref(group.id)}>{group.name}</a></li>
			{/each}
		</ul>
	{:else}
		{#if data.adminsOnly}
			<h1>Log in as admin</h1>
			<p>Pick yourself, then enter your personal PIN. This device will remember you.</p>
		{:else}
			<h1>Who are you?</h1>
			<p>
				{#if data.group}<strong>{data.group}</strong>.{/if}
				Pick yourself. This device will remember you.
			</p>
		{/if}
		{#if form?.message}<p class={styles.error} role="alert">{form.message}</p>{/if}
		<form method="POST" action={chooseAction} use:enhance>
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
							<span>{person.name}</span>
							{#if person.has_pin}<span class={styles.hint}>PIN protected</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</form>
		{#if data.canChangeGroup}
			<p><a href={groupHref(null)}>Choose a different group</a></p>
		{/if}
		{#if data.adminsOnly && data.people.length === 0}
			<p>No one has admin access yet.</p>
		{:else if data.familyIsEmpty}
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
