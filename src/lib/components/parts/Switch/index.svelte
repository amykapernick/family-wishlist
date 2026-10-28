<script lang="ts">
	// house's Switch: a two-option radio group drawn as a toggle.
	import type { Snippet } from 'svelte';
	import styles from './index.module.css';

	let {
		options,
		value,
		toggleFunction,
		name,
		class: className = ''
	}: {
		options: { label: string; icon: Snippet }[];
		value: number;
		toggleFunction: (index: number) => void;
		name: string;
		class?: string;
	} = $props();

	const switchId = $props.id();
</script>

<div class="{styles.container} {className}" role="radiogroup" aria-label={name}>
	{#each options as { label, icon }, index (label)}
		<input
			type="radio"
			id="{switchId}_{index}"
			name={switchId}
			value={index}
			checked={value === index}
			onchange={() => toggleFunction(index)}
			class={styles.radio}
		/>
		<label class={styles.label} for="{switchId}_{index}">
			<span class={styles.text}>{label}</span>
			{@render icon()}
		</label>
	{/each}
	<span class={styles.switch} aria-hidden="true"></span>
</div>
