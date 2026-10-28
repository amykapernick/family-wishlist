<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '#lib/components/parts/Card/index.svelte';
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import ItemFields from '#lib/components/parts/ItemFields/index.svelte';
	import Modal from '#lib/components/parts/Modal/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import Pill from '#lib/components/parts/Pill/index.svelte';
	import StatusMessage from '#lib/components/parts/StatusMessage/index.svelte';
	import type { GiverItemView, ItemView } from '#lib/types.ts';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const isGiverView = (item: ItemView): item is GiverItemView => 'claimed_by_id' in item;
	const nameOf = (id: string | null) => data.people.find((p) => p.id === id)?.name ?? 'Someone';
	const shortDate = (date: string) =>
		new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short'
		});
	// Stays open while editing (each save re-renders the page), and opens on an error.
	let sizesOpen = $state(false);
	$effect(() => {
		if (form && 'sizeId' in form) sizesOpen = true;
	});
	let addSizeModal = $state<Modal>();
	let bulkSizesModal = $state<Modal>();
	const sizeFormError = (which: 'add' | 'bulk') =>
		form && 'sizeForm' in form && form.sizeForm === which ? form : null;
	const addSizeError = $derived(sizeFormError('add'));
	const bulkSizesError = $derived(sizeFormError('bulk'));

	const formatDate = (date: string) =>
		new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	const isOld = (date: string) =>
		Date.now() - Date.parse(`${date.slice(0, 10)}T00:00:00`) > 365 * 864e5;
	const givers = $derived(data.people.filter((p) => p.id !== data.owner.id));
	const title = $derived(data.isOwner ? 'Your wishlist' : `${data.owner.name}’s wishlist`);

	const fieldError = $derived(form && 'field' in form ? form : null);
	const bulkError = $derived(fieldError?.field === 'items' ? fieldError : null);
	const singleError = $derived(fieldError?.field !== 'items' ? fieldError : null);
	const success = $derived(form && 'message' in form && !('field' in form) && !('item' in form));
	const itemError = (id: string) =>
		form && 'item' in form && form.item === id ? (form.message as string) : null;

	let addModal: Modal;
	let bulkModal: Modal;

	/** Close a modal after its form succeeds; on an error it stays open to show it. */
	const closeModalOnSuccess =
		(modal: () => Modal): import('$app/forms').SubmitFunction =>
		() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') modal().close();
		};

	/** Close an open <details> after its form succeeds. */
	const closeOnSuccess: import('$app/forms').SubmitFunction =
		({ formElement }) =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') formElement.closest('details')?.removeAttribute('open');
		};
</script>

<svelte:head><title>{title} · Family Wishlist</title></svelte:head>

<PageTitle {title} actions={pageActions} />

{#snippet pageActions()}
	<!-- command/commandfor open the modal without JavaScript where supported. -->
	<button
		type="button"
		aria-haspopup="dialog"
		command="show-modal"
		commandfor="add-item"
		onclick={() => addModal.open()}>Add Item</button
	>
	<button
		type="button"
		aria-haspopup="dialog"
		command="show-modal"
		commandfor="bulk-add"
		onclick={() => bulkModal.open()}>Bulk Add Items</button
	>
	{#if !data.isOwner}
		<a class="btn secondary" href="/people/{data.owner.id}/history">Past gifts</a>
		<a class="btn secondary" href="/people/{data.owner.id}/ask">Ask for ideas</a>
	{/if}
{/snippet}

<Modal
	bind:this={addModal}
	id="add-item"
	title={data.isOwner ? 'Add an item' : `Add an item for ${data.owner.name}`}
	openOnLoad={!!singleError}
>
	{#if !data.isOwner}
		<p class={styles.hint}>{data.owner.name} will see this on their list.</p>
	{/if}
	<form method="POST" action="?/add" use:enhance={closeModalOnSuccess(() => addModal)}>
		<ItemFields
			error={singleError ? (singleError.message as string) : null}
			errorField={singleError ? (singleError.field as string) : null}
		/>
		<button type="submit">Add</button>
	</form>
</Modal>

<Modal
	bind:this={bulkModal}
	id="bulk-add"
	title={data.isOwner ? 'Bulk add items' : `Bulk add items for ${data.owner.name}`}
	openOnLoad={!!bulkError}
>
	<form method="POST" action="?/addMany" use:enhance={closeModalOnSuccess(() => bulkModal)}>
		<label for="bulk-items">Items, one per line <span class={styles.hint}>(up to 20)</span></label>
		<div id="bulk-items-hint" class={styles.example}>
			<p>For example:</p>
			<pre>{`Dinosaur puzzle
Rain jacket - size 6, any colour
Paint set https://example.com/paints
always Fancy chocolates`}</pre>
		</div>
		<textarea
			id="bulk-items"
			name="items"
			rows="8"
			required
			aria-describedby="bulk-items-hint{bulkError ? ' bulk-items-error' : ''}"
			aria-invalid={bulkError ? 'true' : undefined}
			>{bulkError && 'text' in bulkError ? bulkError.text : ''}</textarea
		>
		{#if bulkError}
			<p id="bulk-items-error" class={styles.error} role="alert">{bulkError.message}</p>
		{/if}
		<button type="submit">Add all</button>
	</form>
</Modal>

{#if data.canEditSizes}
	<Modal
		bind:this={addSizeModal}
		id="add-size"
		title={data.isOwner ? 'Add a size' : `Add a size for ${data.owner.name}`}
		openOnLoad={!!addSizeError}
	>
		<form
			method="POST"
			action="?/addSize"
			use:enhance={closeModalOnSuccess(() => addSizeModal!)}
			class={styles.modalForm}
		>
			<label for="size-item-new">For</label>
			<input
				id="size-item-new"
				name="size_item"
				required
				maxlength="60"
				placeholder="e.g. Shoes"
				defaultValue={addSizeError?.sizeItem ?? ''}
				aria-describedby="size-new-hint{addSizeError ? ' size-new-error' : ''}"
			/>
			<label for="size-value-new">Size</label>
			<input
				id="size-value-new"
				name="size_value"
				required
				maxlength="100"
				placeholder="e.g. AU 9"
				defaultValue={addSizeError?.sizeValue ?? ''}
				aria-describedby="size-new-hint{addSizeError ? ' size-new-error' : ''}"
			/>
			<p id="size-new-hint" class={styles.hint}>
				If there’s already a size for it, this replaces it.
			</p>
			{#if addSizeError}
				<p id="size-new-error" class={styles.error} role="alert">{addSizeError.sizeError}</p>
			{/if}
			<button type="submit">Add size</button>
		</form>
	</Modal>

	<Modal
		bind:this={bulkSizesModal}
		id="bulk-add-sizes"
		title={data.isOwner ? 'Bulk add sizes' : `Bulk add sizes for ${data.owner.name}`}
		openOnLoad={!!bulkSizesError}
	>
		<form
			method="POST"
			action="?/setSizes"
			use:enhance={closeModalOnSuccess(() => bulkSizesModal!)}
			class={styles.modalForm}
		>
			<label for="bulk-sizes">Sizes, one per line</label>
			<div id="bulk-sizes-hint" class={styles.example}>
				<p>For example:</p>
				<pre>{`Shoes: AU 9
T-shirt: M
Hat: remove`}</pre>
			</div>
			<textarea
				id="bulk-sizes"
				name="sizes"
				rows="6"
				required
				aria-describedby="bulk-sizes-hint{bulkSizesError ? ' bulk-sizes-error' : ''}"
				aria-invalid={bulkSizesError ? 'true' : undefined}
				>{bulkSizesError?.sizeBulk ?? ''}</textarea
			>
			{#if bulkSizesError}
				<p id="bulk-sizes-error" class={styles.error} role="alert">{bulkSizesError.sizeError}</p>
			{/if}
			<button type="submit">Save sizes</button>
		</form>
	</Modal>
{/if}

<div class={styles.page}>
	<StatusMessage message={success ? (form?.message as string) : null} />

	{#if data.items.length === 0}
		<EmptyState>
			<p>
				{data.isOwner ? 'Your list is empty.' : `${data.owner.name}’s list is empty.`} Use
				<strong>Add Item</strong> to add the first idea.
			</p>
		</EmptyState>
	{:else}
		<ul class={styles.items}>
			{#each data.items as item (item.id)}
				<Card
					tag="li"
					class={styles.item}
					data-status={item.status}
					data-evergreen={item.evergreen || undefined}
				>
					<div class={styles.itemHead}>
						<h2 class={styles.itemTitle}>
							{#if item.url}
								<a href={item.url} target="_blank" rel="noopener noreferrer external">
									{item.title}<span class="sr-only"> (opens in a new tab)</span>
								</a>
							{:else}
								{item.title}
							{/if}
						</h2>
						{#if item.evergreen}<Pill colour="navy">Always wanted</Pill>{/if}
						{#if isGiverView(item) && item.status === 'claimed'}
							<Pill>
								Claimed by {nameOf(item.claimed_by_id)}{item.entered_by_id &&
								item.entered_by_id !== item.claimed_by_id
									? ` (added by ${nameOf(item.entered_by_id)})`
									: ''}
							</Pill>
						{/if}
					</div>
					{#if item.notes}<p class={styles.notes}>{item.notes}</p>{/if}

					{#if isGiverView(item) && item.evergreen}
						<p class={styles.claims}>
							{#if item.recent_claims.length === 0}
								Not claimed in the last 6 months.
							{:else}
								Claimed {item.recent_claims.length === 1
									? 'once'
									: `${item.recent_claims.length} times`} in the last 6 months:
								{item.recent_claims
									.map((c) => `${nameOf(c.claimed_by_id)} (${shortDate(c.created_at)})`)
									.join(', ')}.
							{/if}
						</p>
					{/if}

					{#if itemError(item.id)}
						<p class={styles.error} role="alert">{itemError(item.id)}</p>
					{/if}

					{#if isGiverView(item) && (item.can_claim || item.can_unclaim)}
						<div class={styles.actions}>
							{#if item.can_claim}
								<form method="POST" action="?/claim" use:enhance class={styles.claim}>
									<input type="hidden" name="item" value={item.id} />
									<label for="giver-{item.id}" class="sr-only">Gift from</label>
									<select id="giver-{item.id}" name="giver">
										{#each givers as giver (giver.id)}
											<option value={giver.id} selected={giver.id === data.actingId}>
												From {giver.name}
											</option>
										{/each}
									</select>
									<button type="submit">
										{item.evergreen && item.recent_claims.length > 0 ? 'Claim too' : 'Claim'}<span
											class="sr-only"
										>
											{item.title}</span
										>
									</button>
								</form>
							{/if}
							{#if item.can_unclaim}
								<form method="POST" action="?/unclaim" use:enhance>
									<input type="hidden" name="item" value={item.id} />
									<button type="submit" class="secondary">
										{item.evergreen ? 'Release my claim' : 'Release claim'}<span class="sr-only">
											on {item.title}</span
										>
									</button>
								</form>
							{/if}
						</div>
					{/if}

					{#if item.can_edit}
						<details class={styles.details}>
							<summary>Edit<span class="sr-only"> {item.title}</span></summary>
							<form method="POST" action="?/edit" use:enhance={closeOnSuccess}>
								<input type="hidden" name="item" value={item.id} />
								<ItemFields
									title={item.title}
									url={item.url}
									notes={item.notes}
									evergreen={item.evergreen}
								/>
								<div class={styles.actions}>
									<button type="submit">Save</button>
								</div>
							</form>
							<form method="POST" action="?/remove" use:enhance class={styles.remove}>
								<input type="hidden" name="item" value={item.id} />
								<button type="submit" class="danger">
									Remove from list<span class="sr-only">: {item.title}</span>
								</button>
							</form>
						</details>
					{/if}
				</Card>
			{/each}
		</ul>
	{/if}

	<Card tag="section" theme="white" aria-labelledby="sizes-heading">
		<div class={styles.sectionHead}>
			<h2 id="sizes-heading" class={styles.sectionTitle}>
				{data.isOwner ? 'Your sizes' : `${data.owner.name}’s sizes`}
			</h2>
			{#if data.canEditSizes}
				<div class={styles.actions}>
					<button
						type="button"
						aria-haspopup="dialog"
						command="show-modal"
						commandfor="add-size"
						onclick={() => addSizeModal?.open()}>Add Size</button
					>
					<button
						type="button"
						aria-haspopup="dialog"
						command="show-modal"
						commandfor="bulk-add-sizes"
						onclick={() => bulkSizesModal?.open()}>Bulk Add Sizes</button
					>
				</div>
			{/if}
		</div>
		{#if data.sizes.length === 0}
			<p>
				{data.isOwner ? 'You haven’t' : `${data.owner.name} hasn’t`} added any sizes yet.
			</p>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class={styles.tableWrap} role="region" aria-label="Sizes table" tabindex="0">
				<table>
					<thead>
						<tr>
							<th scope="col">For</th>
							<th scope="col">Size</th>
							<th scope="col">Updated</th>
						</tr>
					</thead>
					<tbody>
						{#each data.sizes as size (size.id)}
							<tr>
								<th scope="row">{size.item}</th>
								<td>{size.size}</td>
								<td class={styles.updated}>
									{formatDate(size.updated_at)}
									{#if isOld(size.updated_at)}<span class={styles.old}>(over a year ago)</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if data.canEditSizes}
			{#if data.sizes.length > 0}
				<details class={styles.details} bind:open={sizesOpen}>
					<summary>Edit sizes</summary>
					<ul class={styles.sizeRows}>
						{#each data.sizes as size (size.id)}
							<li>
								<form method="POST" action="?/saveSize" use:enhance class={styles.sizeForm}>
									<input type="hidden" name="size" value={size.id} />
									<div>
										<label for="size-item-{size.id}">For</label>
										<input
											id="size-item-{size.id}"
											name="size_item"
											defaultValue={size.item}
											required
											maxlength="60"
										/>
									</div>
									<div>
										<label for="size-value-{size.id}">Size</label>
										<input
											id="size-value-{size.id}"
											name="size_value"
											defaultValue={size.size}
											required
											maxlength="100"
										/>
									</div>
									<button type="submit">Save<span class="sr-only"> {size.item}</span></button>
									<button type="submit" class="danger" formaction="?/removeSize" formnovalidate>
										Remove<span class="sr-only"> {size.item}</span>
									</button>
								</form>
								{#if form && 'sizeId' in form && form.sizeId === size.id}
									<p class={styles.error} role="alert">{form.sizeError}</p>
								{/if}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{:else}
			<p class={styles.hint}>
				Only {data.owner.name}, or someone acting as them, can change these.
			</p>
		{/if}
	</Card>
</div>
