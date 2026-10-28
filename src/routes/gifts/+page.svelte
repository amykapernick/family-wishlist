<script lang="ts">
	import Card from '#lib/components/parts/Card/index.svelte';
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import ExternalLink from '#lib/components/parts/ExternalLink/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import Pill from '#lib/components/parts/Pill/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data }: PageProps = $props();

	const formatDate = (date: string) =>
		new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<svelte:head><title>Gifts · Family Wishlist</title></svelte:head>

<PageTitle title="Your gifts" />

<p class={styles.intro}>Everything you’ve claimed in the last 6 months, by who it’s for.</p>

{#if data.recipients.length === 0}
	<EmptyState><p>No gifts claimed in the last 6 months.</p></EmptyState>
{:else}
	<div class={styles.page}>
		{#each data.recipients as recipient (recipient.id)}
			<section aria-labelledby="for-{recipient.id}">
				<h2 id="for-{recipient.id}" class={styles.recipient}>
					{#if recipient.canOpen}
						<a href="/people/{recipient.id}">{recipient.name}</a>
					{:else}
						{recipient.name}
					{/if}
				</h2>
				<ul class={styles.items}>
					{#each recipient.gifts as gift (gift.id)}
						<Card tag="li" class={styles.item} data-evergreen={gift.evergreen === 1 || undefined}>
							<h3 class={styles.itemTitle}>
								{#if gift.url}
									<ExternalLink href={gift.url}>{gift.title}</ExternalLink>
								{:else}
									{gift.title}
								{/if}
							</h3>
							{#if gift.notes}<p class={styles.notes}>{gift.notes}</p>{/if}
							<p class={styles.claimed}>
								{#if gift.evergreen}<Pill colour="navy">Always wanted</Pill>{/if}
								Claimed {formatDate(gift.claimed_at)}
							</p>
						</Card>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
