<script lang="ts">
	// house's Default layout title row: the page heading plus optional actions.
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	const { title, actions }: { title: string; actions?: Snippet } = $props();
</script>

<div class={styles.titleRow}>
	<h1 class={styles.title}>{title}</h1>
	{#if actions}
		<div class={styles.actions}>{@render actions()}</div>
	{/if}
</div>
