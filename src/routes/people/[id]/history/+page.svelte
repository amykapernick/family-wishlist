<script lang="ts">
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import ExternalLink from '#lib/components/parts/ExternalLink/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data }: PageProps = $props();

	const format = (date: string | null) =>
		date
			? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})
			: '—';
</script>

<svelte:head><title>Past gifts for {data.owner.name} · Family Wishlist</title></svelte:head>

<PageTitle title="Past gifts for {data.owner.name}">
	{#snippet actions()}
		<a class="btn secondary" href="/people/{data.owner.id}">Wishlist</a>
	{/snippet}
</PageTitle>

<p class={styles.range}>
	{data.showAll ? 'Showing every gift on record.' : 'Showing the last 12 months.'}
	<a href={data.showAll ? '?' : '?all'}>{data.showAll ? 'Show last 12 months' : 'Show all'}</a>
</p>

{#if data.gifts.length === 0}
	<EmptyState>
		<p>No gifts recorded {data.showAll ? 'yet' : 'in the last 12 months'}.</p>
	</EmptyState>
{:else}
	<!-- Scrollable regions need to be focusable so keyboard users can scroll them. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class={styles.tableWrap} role="region" aria-label="Past gifts" tabindex="0">
		<table>
			<thead>
				<tr>
					<th scope="col">Gift</th>
					<th scope="col">From</th>
					<th scope="col">Claimed</th>
				</tr>
			</thead>
			<tbody>
				{#each data.gifts as gift (gift.id)}
					<tr>
						<td>
							{#if gift.evergreen}<span class="sr-only">Always wanted: </span>{/if}
							{#if gift.url}
								<ExternalLink href={gift.url}>{gift.title}</ExternalLink>
							{:else}
								{gift.title}
							{/if}
							{#if gift.evergreen}<span class={styles.evergreen} aria-hidden="true"
									>Always wanted</span
								>{/if}
						</td>
						<td>{gift.from}</td>
						<td class={styles.date}>{format(gift.claimedAt)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
