<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '#lib/components/parts/Card/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import PinField from '#lib/components/parts/PinField/index.svelte';
	import StatusMessage from '#lib/components/parts/StatusMessage/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const failed = $derived(form && 'field' in form ? form : null);
	const succeeded = $derived(form && !('field' in form) ? form.message : null);
</script>

<svelte:head><title>Settings · Family Wishlist</title></svelte:head>

<PageTitle title="Settings" />

<div class={styles.page}>
	<StatusMessage message={succeeded} />
	{#if failed}<p class={styles.error} role="alert">{failed.message}</p>{/if}

	<Card tag="section" theme="white" aria-labelledby="pin-heading">
		<h2 id="pin-heading" class={styles.sectionTitle}>Personal PIN for {data.acting.name}</h2>
		<p>
			A personal PIN stops others on the family link from acting as {data.acting.name}. To set a PIN
			for someone else, switch to acting as them first.
		</p>
		{#if data.acting.is_admin && !data.acting.has_pin}
			<p class={styles.notice}>
				{data.acting.name} is an admin. Set a PIN to turn on admin access.
			</p>
		{/if}
		<form method="POST" action="?/setPin" use:enhance>
			<input type="hidden" name="person" value={data.acting.id} />
			{#if data.acting.has_pin}
				<PinField label="Current PIN" name="current" />
			{/if}
			<PinField label="New PIN (4 to 12 digits)" />
			<PinField label="Confirm new PIN" name="confirm" />
			<button type="submit">Save PIN</button>
		</form>
		{#if data.acting.has_pin && !data.acting.is_admin}
			<details class={styles.details}>
				<summary>Remove PIN</summary>
				<form method="POST" action="?/clearPin" use:enhance>
					<input type="hidden" name="person" value={data.acting.id} />
					<PinField label="Current PIN" name="current" />
					<button type="submit" class="danger">Remove PIN</button>
				</form>
			</details>
		{/if}
	</Card>

	<Card tag="section" theme="white" aria-labelledby="recommenders-heading">
		<h2 id="recommenders-heading" class={styles.sectionTitle}>
			Recommenders for {data.acting.name}
		</h2>
		<p>
			When someone asks for gift ideas for {data.acting.name}, everyone ticked here is asked, and
			their answers are added to {data.acting.name}’s list. With no one ticked, {data.acting.name} is
			asked instead. Admins can also set these.
		</p>
		<form
			method="POST"
			action="?/setRecommenders"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<input type="hidden" name="person" value={data.acting.id} />
			<fieldset>
				<legend class="sr-only">Recommenders for {data.acting.name}</legend>
				<ul class={styles.checklist}>
					{#each data.recommenderOptions as person (person.id)}
						<li>
							<label>
								<input
									type="checkbox"
									name="recommender"
									value={person.id}
									checked={person.chosen}
								/>
								{person.name}
							</label>
						</li>
					{/each}
				</ul>
			</fieldset>
			<button type="submit">Save recommenders</button>
		</form>
	</Card>

	<Card tag="section" theme="white" aria-labelledby="family-heading">
		<h2 id="family-heading" class={styles.sectionTitle}>Family members</h2>
		{#if data.isAdmin}
			<p>Add and update family members, links and security in <a href="/admin">Admin</a>.</p>
		{:else if data.hasAdmin}
			<p>A family admin can add, update or remove family members.</p>
		{:else}
			<p>No one has admin access yet. See “Making someone an admin” in the README to set one up.</p>
		{/if}
	</Card>
</div>
