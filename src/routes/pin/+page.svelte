<script lang="ts">
	import { enhance } from '$app/forms';
	import Narrow from '#lib/components/layouts/Narrow/index.svelte';
	import PinField from '#lib/components/parts/PinField/index.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Family Wishlist</title></svelte:head>

<Narrow>
	<h1>Family Wishlist</h1>
	<p>Enter the family PIN to continue.</p>
	<form method="POST" use:enhance>
		<PinField label="Family PIN" error={form?.message} />
		<button type="submit">Continue</button>
	</form>
</Narrow>
