<script lang="ts">
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	const { children, class: className = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class={[styles.root, className]}>
	{@render children()}
</div>
