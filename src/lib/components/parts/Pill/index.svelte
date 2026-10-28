<script lang="ts">
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	const {
		children,
		colour = 'green',
		outline = false,
		class: className = ''
	}: {
		children: Snippet;
		colour?: 'green' | 'purple_bright' | 'navy' | 'orange' | 'red';
		outline?: boolean;
		class?: string;
	} = $props();
</script>

<span
	class={[styles.root, outline && styles.outline, className]}
	style:--pill_background="var(--{colour})"
	style:--pill_colour="var(--{colour}_text)"
>
	{@render children()}
</span>
