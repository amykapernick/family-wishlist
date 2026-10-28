<script lang="ts">
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import PersonCard from '#lib/components/parts/PersonCard/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data }: PageProps = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<svelte:head><title>Wishlists · Family Wishlist</title></svelte:head>

<h1>Wishlists</h1>
{#if data.people.length === 0}
	<EmptyState><p>No one here yet. An admin can add the family.</p></EmptyState>
{:else}
	<ul class={styles.grid}>
		{#each data.people as person (person.id)}
			<li>
				<PersonCard
					href="/people/{person.id}"
					name={person.isActing ? `${person.name} (you)` : person.name}
					detail={person.isActing
						? `${plural(person.count, 'item')} on your list`
						: `${plural(person.count, 'wanted item')}`}
					current={person.isActing}
				/>
			</li>
		{/each}
	</ul>
{/if}
