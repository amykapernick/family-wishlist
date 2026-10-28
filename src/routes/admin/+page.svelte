<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '#lib/components/parts/Card/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import Pill from '#lib/components/parts/Pill/index.svelte';
	import StatusMessage from '#lib/components/parts/StatusMessage/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? 'Someone';
	const failed = $derived(form && 'field' in form ? form : null);
	const succeeded = $derived(form && !('field' in form) ? form.message : null);
	const keep: import('$app/forms').SubmitFunction =
		() =>
		async ({ update }) =>
			update({ reset: false });

	/** Collapse the person's <details> after saving, keeping focus on its summary. */
	const collapse: import('$app/forms').SubmitFunction =
		({ formElement }) =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type !== 'success') return;
			const details = formElement.closest('details');
			details?.removeAttribute('open');
			details?.querySelector('summary')?.focus();
		};

	let confirmSignOut = $state(false);

	const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	/** "4 wishlist items, 2 sizes and 1 idea request" */
	function removalSummary(d: { items: number; requests: number; sizes: number }) {
		const deleted = [
			d.items && count(d.items, 'wishlist item'),
			d.sizes && count(d.sizes, 'size'),
			d.requests && count(d.requests, 'idea request')
		].filter(Boolean);
		return deleted.length
			? `${deleted.slice(0, -1).join(', ')}${deleted.length > 1 ? ' and ' : ''}${deleted.at(-1)}`
			: 'no list items, sizes or idea requests';
	}
</script>

<!-- Clicking outside an open recommenders picker closes it. -->
<svelte:window
	onclick={(e) => {
		for (const picker of document.querySelectorAll<HTMLDetailsElement>(`.${styles.picker}[open]`)) {
			if (!picker.contains(e.target as Node)) picker.open = false;
		}
	}}
/>

<svelte:head><title>Admin · Family Wishlist</title></svelte:head>

<PageTitle title="Admin" />

<div class={styles.page}>
	<p class="subtitle">Admin access only works while the admin has a personal PIN.</p>
	<StatusMessage message={succeeded} />
	{#if failed}<p class={styles.error} role="alert">{failed.message}</p>{/if}

	<Card tag="section" theme="white" aria-labelledby="people-heading">
		<h2 id="people-heading" class={styles.sectionTitle}>Family members</h2>
		<p class={styles.hint}>
			Phone numbers are optional and only used for text messages later. Use international format,
			like +61400000000.
		</p>
		<ul class={styles.people}>
			{#each data.people as person (person.id)}
				<li>
					<details class={styles.details}>
						<summary>
							<span class={styles.personName}>{person.name}</span>
							<span class={styles.tags}>
								{#if person.is_admin}
									<Pill colour={person.has_pin ? 'purple_bright' : 'orange'}>
										{person.has_pin ? 'Admin' : 'Admin (needs a PIN)'}
									</Pill>
								{/if}
								{#if person.has_pin}<Pill colour="green" outline>PIN</Pill>{/if}
								{#if person.id === data.selfId}<Pill colour="navy">You</Pill>{/if}
							</span>
						</summary>
						<form method="POST" action="?/updatePerson" use:enhance={keep}>
							<input type="hidden" name="person" value={person.id} />
							{@render personFields(person.id, person)}
							<button type="submit">Save {person.name}</button>
						</form>
						<div class={styles.actions}>
							{#if person.has_pin && !person.is_admin}
								<form method="POST" action="?/resetPin" use:enhance>
									<input type="hidden" name="person" value={person.id} />
									<button type="submit" class="secondary">Reset {person.name}’s PIN</button>
								</form>
							{/if}
						</div>
						{#if person.id !== data.selfId}
							{@const owned = data.personData[person.id]}
							<details class={styles.details}>
								<summary class={styles.danger}>Remove {person.name}…</summary>
								<p>
									This removes {person.name} and everything that’s theirs:
									{removalSummary(owned)}.
									{#if owned.claims}
										Their {count(owned.claims, 'claim')} on other people’s lists (including past gifts)
										{owned.claims === 1 ? 'is' : 'are'} kept, just without their name, so nothing gets
										bought twice.
									{/if}
									This can’t be undone.
								</p>
								<form method="POST" action="?/removePerson" use:enhance>
									<input type="hidden" name="person" value={person.id} />
									<button type="submit" class="danger">
										Yes, remove {person.name} and their data
									</button>
								</form>
							</details>
						{/if}
					</details>
				</li>
			{/each}
		</ul>
		<details class={styles.details}>
			<summary>Add a family member</summary>
			<form method="POST" action="?/addPerson" use:enhance>
				{@render personFields('new', null)}
				<button type="submit">Add</button>
			</form>
		</details>
		<details class={styles.details} open={failed?.field === 'people' || undefined}>
			<summary>Add several family members</summary>
			<form method="POST" action="?/bulkAddPeople" use:enhance>
				<label for="bulk-people">
					Family members, one per line <span class={styles.hint}>(added without admin access)</span>
				</label>
				<div id="bulk-people-hint" class={styles.example}>
					<p>For example:</p>
					<pre>{`Mia +61400000004
Grandma June +61 400 000 005
Leo`}</pre>
				</div>
				<textarea
					id="bulk-people"
					name="people"
					rows="6"
					required
					aria-describedby="bulk-people-hint{failed?.field === 'people'
						? ' bulk-people-error'
						: ''}"
					aria-invalid={failed?.field === 'people' || undefined}
					>{failed && 'text' in failed ? failed.text : ''}</textarea
				>
				{#if failed?.field === 'people'}
					<div id="bulk-people-error" class={styles.error}>
						<p>{failed.message}</p>
						{#if 'problems' in failed && failed.problems}
							<ul>
								{#each failed.problems as string[] as problem (problem)}<li>{problem}</li>{/each}
							</ul>
						{/if}
					</div>
				{/if}
				<button type="submit">Add everyone</button>
			</form>
		</details>
	</Card>

	<Card tag="section" theme="white" aria-labelledby="recommenders-heading">
		<h2 id="recommenders-heading" class={styles.sectionTitle}>Recommenders</h2>
		<p class={styles.hint}>
			Who is asked for gift ideas about each person. Their answers are added to that person’s list.
			With no recommenders, the person themselves is asked. People can also set their own in
			Settings.
		</p>
		<ul class={styles.people}>
			{#each data.people as person (person.id)}
				{@const chosen = data.recommenders
					.filter((r) => r.person_id === person.id)
					.map((r) => r.recommender_id)}
				<li class={styles.recommenderRow}>
					<span class={styles.personName}>{person.name}</span>
					<span class={styles.tags}>
						{#each chosen as id (id)}
							<Pill colour="navy">{nameOf(id)}</Pill>
						{:else}
							<span class={styles.hint}>None: asks them directly</span>
						{/each}
					</span>
					<!-- Escape from anywhere in the open picker closes it, like other menus. -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<details
						class={styles.picker}
						ontoggle={(e) => {
							// Closing without saving drops any unsaved ticks.
							const details = e.currentTarget;
							if (!details.open) details.querySelector('form')?.reset();
						}}
						onkeydown={(e) => {
							if (e.key !== 'Escape' || !e.currentTarget.open) return;
							e.currentTarget.open = false;
							e.currentTarget.querySelector('summary')?.focus();
						}}
					>
						<summary class={styles.addPill}>
							<span><span aria-hidden="true">+</span> Add person</span><span class="sr-only"
								>{` to ${person.name}’s recommenders`}</span
							>
						</summary>
						<form
							method="POST"
							action="?/setRecommenders"
							class={styles.pickerPanel}
							use:enhance={collapse}
						>
							<input type="hidden" name="person" value={person.id} />
							<fieldset>
								<legend>Recommenders for {person.name}</legend>
								<ul class={styles.checklist}>
									{#each data.people.filter((p) => p.id !== person.id) as other (other.id)}
										<li>
											<label>
												<input
													type="checkbox"
													name="recommender"
													value={other.id}
													defaultChecked={chosen.includes(other.id)}
												/>
												{other.name}
											</label>
										</li>
									{/each}
								</ul>
							</fieldset>
							<button type="submit"
								>Save recommenders<span class="sr-only"> for {person.name}</span></button
							>
						</form>
					</details>
				</li>
			{/each}
		</ul>
	</Card>

	<Card tag="section" theme="white" aria-labelledby="security-heading">
		<h2 id="security-heading" class={styles.sectionTitle}>Security</h2>

		<h3>PIN lockouts</h3>
		{#if data.lockouts.length === 0}
			<p>No one is locked out right now.</p>
		{:else}
			<p>These are locked out for up to 15 minutes after too many wrong PINs:</p>
			<ul>
				{#each data.lockouts as lockout (lockout)}<li>{lockout}</li>{/each}
			</ul>
			<form method="POST" action="?/clearLockouts" use:enhance>
				<button type="submit" class="secondary">Clear lockouts</button>
			</form>
		{/if}

		<h3>Sign out every device</h3>
		<p>
			Use this if the family link was shared with the wrong person. Everyone except you will need
			the family link or PIN again. If the link itself leaked, also change <code>FAMILY_TOKEN</code>
			(see the README).
		</p>
		{#if confirmSignOut}
			<form
				method="POST"
				action="?/signOutAll"
				use:enhance={() =>
					async ({ update }) => {
						confirmSignOut = false;
						await update();
					}}
				class={styles.confirm}
			>
				<p class={styles.error} role="alert">Sign out every other device now?</p>
				<div class={styles.actions}>
					<button type="submit">Yes, sign everyone out</button>
					<button type="button" class="secondary" onclick={() => (confirmSignOut = false)}>
						Cancel
					</button>
				</div>
			</form>
		{:else}
			<!-- Without JavaScript this submits straight away; with it, ask first. -->
			<form
				method="POST"
				action="?/signOutAll"
				onsubmit={(e) => {
					e.preventDefault();
					confirmSignOut = true;
				}}
			>
				<button type="submit" class="danger">Sign out every device…</button>
			</form>
		{/if}
	</Card>
</div>

{#snippet personFields(
	key: string,
	person: { name: string; phone: string | null; is_admin: boolean } | null
)}
	<label for="name-{key}">Name</label>
	<input id="name-{key}" name="name" value={person?.name ?? ''} required maxlength="80" />
	<label for="phone-{key}">Mobile <span class={styles.hint}>(optional)</span></label>
	<input
		id="phone-{key}"
		name="phone"
		type="tel"
		autocomplete="off"
		value={person?.phone ?? ''}
		placeholder="+61400000000"
	/>
	<label>
		<input type="checkbox" name="is_admin" checked={person?.is_admin ?? false} />
		Admin (can manage the family and the app)
	</label>
{/snippet}
