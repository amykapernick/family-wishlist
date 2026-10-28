<script lang="ts">
	// Confirms "Ask for ideas" about someone. The page it's on needs an `ask`
	// action (see #lib/server/ask.ts).
	import { enhance } from '$app/forms';
	import Modal from '#lib/components/parts/Modal/index.svelte';
	import type { AskTargets } from '#lib/types.ts';
	import styles from './index.module.css';

	const { about, ask }: { about: { id: string; name: string }; ask: AskTargets } = $props();

	/** "Alex", "Alex and Sam", "Alex, Sam and June" */
	const listNames = (names: string[]) =>
		names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	// Anyone already asked and not answered yet is skipped, so they aren't named.
	const toAsk = $derived(listNames(ask.targets.filter((p) => !p.waiting).map((p) => p.name)));
	const waiting = $derived(listNames(ask.targets.filter((p) => p.waiting).map((p) => p.name)));

	let modal: Modal;
	export function open() {
		modal.open();
	}

	/** Close either way: the result shows as the page's status message. */
	const closeOnResult: import('$app/forms').SubmitFunction =
		() =>
		async ({ update }) => {
			modal.close();
			await update();
		};
</script>

<Modal bind:this={modal} id="confirm-ask" title="Ask for ideas?">
	<form method="POST" action="?/ask" use:enhance={closeOnResult} class={styles.form}>
		{#if ask.asksThemselves && toAsk}
			<p>We’ll ask <strong>{about.name}</strong> to add some ideas to their list.</p>
		{:else if toAsk}
			<p>We’ll ask <strong>{toAsk}</strong> for ideas about {about.name}.</p>
		{/if}
		{#if waiting}
			<p class={styles.hint}>
				Still waiting to hear back from {waiting}, so they won’t be asked again.
			</p>
		{/if}
		{#if !ask.asksThemselves && !ask.waitingOnThem}
			<label>
				<input type="checkbox" name="also_ask_them" />
				Ask {about.name} as well
			</label>
		{/if}
		<p class={styles.hint}>Every answer is added to {about.name}’s list as well.</p>
		<div class={styles.actions}>
			<button type="submit">Send request</button>
			<button type="button" class="secondary" onclick={() => modal.close()}>Cancel</button>
		</div>
	</form>
</Modal>
