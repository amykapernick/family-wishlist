<script lang="ts">
	import { enhance } from '$app/forms';
	import Narrow from '#lib/components/layouts/Narrow/index.svelte';
	import PinField from '#lib/components/parts/PinField/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Act as {data.target.name} · Family Wishlist</title></svelte:head>

<Narrow>
	<h1>Act as {data.target.name}</h1>
	<p>{data.target.name} has a personal PIN. Enter it to act on their behalf.</p>
	<form method="POST" use:enhance>
		<input type="hidden" name="to" value={data.target.id} />
		<input type="hidden" name="next" value={data.next} />
		<PinField label="{data.target.name}’s PIN" error={form?.message} autofocus />
		<div class={styles.actions}>
			<button type="submit">Switch</button>
			<a href={data.next} class="btn secondary">Cancel</a>
		</div>
	</form>
</Narrow>
