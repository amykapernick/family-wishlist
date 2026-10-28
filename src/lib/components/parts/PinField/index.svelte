<script lang="ts">
	import styles from './index.module.css';

	let {
		label,
		error = null,
		name = 'pin',
		autofocus = false,
		required = true
	}: {
		label: string;
		error?: string | null;
		name?: string;
		autofocus?: boolean;
		required?: boolean;
	} = $props();

	const id = $props.id();
</script>

<div class={styles.field}>
	<label for="{id}-pin">{label}</label>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		id="{id}-pin"
		{name}
		type="password"
		inputmode="numeric"
		autocomplete="off"
		pattern="[0-9]*"
		minlength="4"
		maxlength="12"
		{required}
		{autofocus}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
	/>
	{#if error}<p id="{id}-error" class={styles.error} role="alert">{error}</p>{/if}
</div>
