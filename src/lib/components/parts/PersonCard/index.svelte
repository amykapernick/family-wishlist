<script lang="ts">
	import styles from './index.module.css';

	const {
		href,
		name,
		detail,
		current = false
	}: { href: string; name: string; detail: string; current?: boolean } = $props();
</script>

<a class={[styles.card, current && styles.current]} {href}>
	<span class={styles.name}>{name}</span>
	<span class={styles.detail}>{detail}</span>
</a>
