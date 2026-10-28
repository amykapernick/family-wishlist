<script lang="ts">
	// A native modal <dialog>: the browser traps focus, closes it on Escape,
	// and returns focus to the button that opened it.
	import { untrack, type Snippet } from 'svelte';
	import styles from './index.module.css';

	let {
		id,
		title,
		openOnLoad = false,
		children
	}: {
		id: string;
		title: string;
		/** Open straight away, e.g. to show a form error after a full page load. */
		openOnLoad?: boolean;
		children: Snippet<[{ close: () => void }]>;
	} = $props();

	let dialog: HTMLDialogElement;
	// Only the server render uses this: without JavaScript an error after a
	// form post shows the dialog open (non-modal). Never changed afterwards,
	// as removing `open` from a modal dialog breaks it.
	const renderOpen = untrack(() => openOnLoad) || undefined;

	export function open() {
		// Without JavaScript an error renders it open (but not modal); upgrade it.
		if (dialog.open && !dialog.matches(':modal')) dialog.close();
		if (!dialog.open) dialog.showModal();
		// Start on the first field rather than the Close button.
		dialog.querySelector<HTMLElement>('form :is(input, textarea, select)')?.focus();
	}

	export function close() {
		dialog.close();
	}

	$effect(() => {
		if (openOnLoad) open();
	});
</script>

<dialog bind:this={dialog} {id} class={styles.modal} aria-labelledby="{id}-title" open={renderOpen}>
	<div class={styles.head}>
		<h2 id="{id}-title" class={styles.title}>{title}</h2>
		<button type="button" class="secondary" command="close" commandfor={id} onclick={close}>
			Close<span class="sr-only"> {title}</span>
		</button>
	</div>
	{@render children({ close })}
</dialog>
