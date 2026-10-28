<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from '#lib/components/parts/Card/index.svelte';
	import styles from './index.module.css';

	const { children }: { children: Snippet } = $props();
</script>

<div class={styles.layout}>
	<Card theme="white">
		{@render children()}
	</Card>
</div>
