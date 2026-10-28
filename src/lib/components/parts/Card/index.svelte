<script lang="ts">
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	const {
		children,
		theme = 'light',
		tag = 'div',
		class: className = '',
		...rest
	}: {
		children: Snippet;
		theme?: 'light' | 'dark' | 'white';
		tag?: 'div' | 'li' | 'section' | 'article';
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<svelte:element this={tag} class="{styles.card} {className}" data-theme={theme} {...rest}>
	{@render children()}
</svelte:element>
