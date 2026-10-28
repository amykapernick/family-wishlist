<script lang="ts">
	// A polite live region that is always in the DOM, so screen readers
	// announce the message when it changes after a form submits.
	import styles from './index.module.css';

	let { message = null }: { message?: string | null } = $props();
</script>

<p class={styles.toast} role="status" aria-live="polite">{message ?? ''}</p>
