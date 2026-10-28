<script lang="ts">
	import styles from './index.module.css';

	let {
		title = '',
		url = '',
		notes = '',
		evergreen = false,
		error = null,
		errorField = null
	}: {
		title?: string;
		url?: string | null;
		notes?: string | null;
		evergreen?: boolean;
		error?: string | null;
		errorField?: string | null;
	} = $props();

	const id = $props.id();
	// defaultValue (not value) so typing survives an error re-render, and a
	// form reset after saving goes back to these.
</script>

<label for="{id}-title">What is it?</label>
<input
	id="{id}-title"
	name="title"
	defaultValue={title}
	required
	maxlength="200"
	aria-invalid={errorField === 'title' ? 'true' : undefined}
	aria-describedby={errorField === 'title' ? `${id}-error` : undefined}
/>
<label for="{id}-url">Link <span class={styles.hint}>(optional)</span></label>
<input
	id="{id}-url"
	name="url"
	type="url"
	inputmode="url"
	defaultValue={url ?? ''}
	placeholder="https://"
	aria-invalid={errorField === 'url' ? 'true' : undefined}
	aria-describedby={errorField === 'url' ? `${id}-error` : undefined}
/>
<label for="{id}-notes">Notes <span class={styles.hint}>(size, colour, where to buy)</span></label>
<textarea id="{id}-notes" name="notes" maxlength="2000" defaultValue={notes ?? ''}></textarea>
<label class={styles.check}>
	<input
		type="checkbox"
		name="evergreen"
		defaultChecked={evergreen}
		aria-describedby="{id}-evergreen"
	/>
	Always wanted
</label>
<p id="{id}-evergreen" class={styles.checkHint}>
	Always welcome, like fancy shampoo or chocolates. It stays on the list after someone claims it, so
	more people can give it.
</p>
{#if error}<p id="{id}-error" class={styles.error} role="alert">{error}</p>{/if}
