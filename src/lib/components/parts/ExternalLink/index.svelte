<script lang="ts">
	// A link to another site: opens in a new tab, with an icon so people know.
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	const { href, children }: { href: string; children: Snippet } = $props();
</script>

<a {href} target="_blank" rel="noopener noreferrer external"
	>{@render children()}<svg class={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
		<path
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
		/>
	</svg><span class="sr-only"> (opens in a new tab)</span></a
>
