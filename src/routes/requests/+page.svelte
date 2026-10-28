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
	const replyError = (id: string) =>
		form && 'request' in form && form.request === id ? form.message : null;
</script>

<svelte:head><title>Requests · Family Wishlist</title></svelte:head>

<PageTitle title="Idea requests" />

<div class={styles.page}>
	<StatusMessage message={form && !('request' in form) ? form.message : null} />

	<section aria-labelledby="inbox-heading">
		<h2 id="inbox-heading">Asked of you</h2>
		{#if data.inbox.length === 0}
			<EmptyState><p>No one has asked you for ideas yet.</p></EmptyState>
		{:else}
			<ul class={styles.list}>
				{#each data.inbox as request (request.id)}
					<Card tag="li" class={styles.request}>
						<p class={styles.requestHead}>
							<span>
								<strong>{request.fromName}</strong> wants gift ideas for
								<strong>{request.about_id === request.asked_id ? 'you' : request.aboutName}</strong>
							</span>
							<Pill colour={pillColours[request.status]}>{labels[request.status]}</Pill>
						</p>
						{#if request.status !== 'closed'}
							<form
								method="POST"
								action="?/reply"
								use:enhance={() =>
									async ({ update }) =>
										update({ reset: false })}
							>
								<input type="hidden" name="request" value={request.id} />
								<label for="response-{request.id}">
									{request.about_id === request.asked_id
										? 'Something you’d like'
										: `Your ideas for ${request.aboutName}`}
								</label>
								<p class={styles.hint} id="response-hint-{request.id}">
									Your first reply is added to {request.about_id === request.asked_id
										? 'your'
										: `${request.aboutName}’s`} list. One idea per line; each can include a link, “ -
									” then notes, and “always” if it’s always welcome.
								</p>
								<textarea
									id="response-{request.id}"
									name="response"
									required
									maxlength="2000"
									aria-invalid={replyError(request.id) ? 'true' : undefined}
									aria-describedby={replyError(request.id)
										? `response-hint-${request.id} response-error-${request.id}`
										: `response-hint-${request.id}`}>{request.response ?? ''}</textarea
								>
								{#if replyError(request.id)}
									<p id="response-error-{request.id}" class={styles.error} role="alert">
										{replyError(request.id)}
									</p>
								{/if}
								<button type="submit">
									{request.response ? 'Update reply' : 'Send reply'}
								</button>
							</form>
						{:else if request.response}
							<blockquote>{request.response}</blockquote>
						{/if}
					</Card>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="sent-heading">
		<h2 id="sent-heading">You asked</h2>
		{#if data.sent.length === 0}
			<EmptyState>
				<p>You haven’t asked anyone yet. Open someone’s wishlist and choose “Ask for ideas”.</p>
			</EmptyState>
		{:else}
			<ul class={styles.list}>
				{#each data.sent as request (request.id)}
					<Card tag="li" class={styles.request}>
						<p class={styles.requestHead}>
							<span>
								You asked <strong
									>{request.asked_id === request.about_id
										? `${request.askedName} (no recommenders)`
										: request.askedName}</strong
								>
								about
								<a href="/people/{request.about_id}/ask">{request.aboutName}</a>
							</span>
							<Pill colour={pillColours[request.status]}>{labels[request.status]}</Pill>
						</p>
						{#if request.response}<blockquote>{request.response}</blockquote>{/if}
					</Card>
				{/each}
			</ul>
		{/if}
	</section>
</div>
