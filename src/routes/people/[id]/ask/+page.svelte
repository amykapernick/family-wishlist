<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '#lib/components/parts/Card/index.svelte';
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import Pill from '#lib/components/parts/Pill/index.svelte';
	import StatusMessage from '#lib/components/parts/StatusMessage/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	const labels = { open: 'Waiting for a reply', answered: 'Answered', closed: 'Closed' };
	const pillColours = { open: 'orange', answered: 'green', closed: 'navy' } as const;
</script>

<svelte:head><title>Ideas for {data.about.name} · Family Wishlist</title></svelte:head>

<PageTitle title="Ideas for {data.about.name}">
	{#snippet actions()}
		<a class="btn secondary" href="/people/{data.about.id}">Wishlist</a>
	{/snippet}
</PageTitle>

<div class={styles.page}>
	<StatusMessage message={form?.message} />

	<Card tag="section" theme="white" aria-labelledby="ask-heading">
		<h2 id="ask-heading" class={styles.sectionTitle}>Ask for ideas</h2>
		{#if data.asksThemselves}
			<p>
				{data.about.name} hasn’t chosen any recommenders, so we’ll ask {data.about.name} to add some ideas
				to their list.
				{#if data.targets[0].waiting}<span class={styles.hint}>(Already asked, waiting.)</span>{/if}
			</p>
		{:else}
			<p>We’ll ask {data.about.name}’s recommenders:</p>
			<ul class={styles.targets}>
				{#each data.targets as person (person.id)}
					<li>
						{person.name}
						{#if person.waiting}<span class={styles.hint}>(already asked, waiting)</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p class={styles.hint}>Every answer is added to {data.about.name}’s list as well.</p>
		<form method="POST" action="?/ask" use:enhance>
			<button type="submit">Ask for ideas</button>
		</form>
	</Card>

	<section aria-labelledby="requests-heading">
		<h2 id="requests-heading">Requests about {data.about.name}</h2>
		{#if data.requests.length === 0}
			<EmptyState><p>No one has asked yet.</p></EmptyState>
		{:else}
			<ul class={styles.requests}>
				{#each data.requests as request (request.id)}
					<Card tag="li" class={styles.request}>
						<p class={styles.requestHead}>
							<span>
								<strong>{request.fromName}</strong> asked <strong>{request.askedName}</strong>
							</span>
							<Pill colour={pillColours[request.status]}>{labels[request.status]}</Pill>
						</p>
						{#if request.response}<blockquote>{request.response}</blockquote>{/if}
						{#if request.from_id === data.actingId && request.status !== 'closed'}
							<form method="POST" action="?/close" use:enhance>
								<input type="hidden" name="request" value={request.id} />
								<button type="submit" class="secondary">Close request</button>
							</form>
						{/if}
					</Card>
				{/each}
			</ul>
		{/if}
	</section>
</div>
