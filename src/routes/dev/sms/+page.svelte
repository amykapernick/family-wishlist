<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Card from '#lib/components/parts/Card/index.svelte';
	import EmptyState from '#lib/components/parts/EmptyState/index.svelte';
	import PageTitle from '#lib/components/parts/PageTitle/index.svelte';
	import Pill from '#lib/components/parts/Pill/index.svelte';
	import StatusMessage from '#lib/components/parts/StatusMessage/index.svelte';
	import type { PageProps } from './$types';
	import styles from './+page.module.css';

	let { data, form }: PageProps = $props();

	type Sent = NonNullable<NonNullable<typeof form>['sent']>;
	type Segments = NonNullable<Sent['reply']>['segments'];
	interface Message {
		dir: 'out' | 'in';
		text: string;
		segments?: Segments;
		/** The exchange an outgoing text started, for "Show steps". */
		exchangeId?: string;
		note?: string;
	}

	const UNKNOWN = '+61499999999';

	// Every text sent in the sandbox this visit. Without JavaScript only the
	// latest one (from the form result) is shown.
	let history = $state<Sent[]>([]);
	let body = $state('');
	let bodyInput = $state<HTMLInputElement | HTMLTextAreaElement>();
	// Datalists only work on single-line inputs, so line breaks (one idea per
	// line) need the textarea instead.
	let multiline = $state(false);
	let threadEl = $state<HTMLOListElement>();
	// Starts on the phone that last sent (no-JS form posts), then follows the select.
	let from = $state(
		untrack(() => form?.sent?.from ?? form?.from ?? data.phones[0]?.phone ?? UNKNOWN)
	);
	let selectedId = $state<string | null>(null);
	/** Messages already seen on each phone, for the "new" count. */
	let seen = $state<Record<string, number>>({});

	const exchanges = $derived(history.length > 0 ? history : form?.sent ? [form.sent] : []);
	const shown = $derived(exchanges.find((e) => e.id === selectedId) ?? exchanges.at(-1) ?? null);

	$effect(() => {
		const sent = form?.sent;
		if (sent && !history.some((h) => h.id === sent.id)) {
			history.push(sent);
			selectedId = sent.id;
		}
	});

	/** Every phone's messages, keyed by number. */
	const threads = $derived.by(() => {
		const phones: Record<string, Message[]> = {};
		const thread = (phone: string) => (phones[phone] ??= []);
		for (const sent of exchanges) {
			thread(sent.from).push(
				{
					dir: 'out',
					text: sent.body,
					exchangeId: sent.id,
					note: sent.reply ? undefined : 'No reply'
				},
				...(sent.reply
					? [{ dir: 'in' as const, text: sent.reply.text, segments: sent.reply.segments }]
					: [])
			);
			for (const o of sent.outbound) {
				thread(o.phone).push({ dir: 'in', text: o.text, segments: o.segments });
			}
		}
		return phones;
	});
	const messages = $derived(threads[from] ?? []);
	const owner = $derived(data.phones.find((p) => p.phone === from)?.name ?? 'Unknown number');
	const unread = (phone: string) => Math.max(0, (threads[phone]?.length ?? 0) - (seen[phone] ?? 0));

	// Mark the open phone as read and keep the newest message in view.
	$effect(() => {
		const count = messages.length;
		seen[from] = count;
		tick().then(() => threadEl?.scrollTo({ top: threadEl.scrollHeight }));
	});

	const status = $derived(
		form?.sent
			? form.sent.reply
				? `Reply to ${form.sent.fromName}: ${form.sent.reply.text}`
				: `No reply sent to ${form.sent.fromName}.`
			: null
	);

	function suggest(text: string) {
		body = text;
		bodyInput?.focus();
	}
</script>

{#snippet bubbles(owner: string, list: Message[], showSteps: boolean)}
	{#each list as message, i (i)}
		<li class={[styles.message, message.dir === 'out' ? styles.out : styles.in]}>
			<span class="sr-only">
				{message.dir === 'out' ? `${owner} sent:` : 'Family Wishlist replied:'}
			</span>
			<span class={styles.bubble}>{message.text}</span>
			{#if message.dir === 'in' && message.segments}
				<span class={styles.meta}>
					{message.segments.encoding} · {message.segments.length} characters ·
					{message.segments.segments}
					{message.segments.segments === 1 ? 'segment' : 'segments'}
				</span>
			{/if}
			{#if message.note}<span class={styles.meta}>{message.note}</span>{/if}
			{#if showSteps && message.exchangeId}
				<button
					type="button"
					class={['text', styles.stepsButton]}
					aria-pressed={shown?.id === message.exchangeId}
					onclick={() => (selectedId = message.exchangeId!)}
				>
					Show steps<span class="sr-only"> for “{message.text}”</span>
				</button>
			{/if}
		</li>
	{/each}
{/snippet}

<svelte:head><title>SMS preview · Family Wishlist</title></svelte:head>

<PageTitle title="SMS preview" />

<div class={styles.page}>
	<p class={styles.banner}>
		<Pill colour="orange">Dev only</Pill>
		Text from a sample phone below to run exactly what the Twilio webhook (<code>POST /api/sms</code
		>) runs, against your local data. Nothing here sends a real text.
	</p>

	<section aria-labelledby="try-heading">
		<h2 id="try-heading">Try it</h2>
		<p>
			Pick whose phone you’re holding and send a text. The reply comes from <code>handleSms()</code
			>, the same function the Twilio webhook calls, and the steps it took appear beside the phone.
			Texts it sends to other people land on their phone here: switch phones to see them.
		</p>
		<StatusMessage message={status} />

		<div class={styles.sandbox}>
			<div class={styles.deviceColumn}>
				<form
					method="POST"
					action="?/send"
					class={styles.device}
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') body = '';
							bodyInput?.focus();
						}}
				>
					<div class={styles.deviceTop}>
						<label for="sms-from">Phone</label>
						<select id="sms-from" name="from" bind:value={from}>
							{#each data.phones as phone (phone.phone)}
								<option value={phone.phone}>
									{phone.name} ({phone.phone}){unread(phone.phone)
										? ` · ${unread(phone.phone)} new`
										: ''}
								</option>
							{/each}
							<option value={UNKNOWN}>Unknown number ({UNKNOWN})</option>
						</select>
					</div>

					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<ol
						class={[styles.thread, styles.deviceThread]}
						bind:this={threadEl}
						tabindex="0"
						aria-label="Messages on {owner}’s phone"
					>
						{#if messages.length === 0}
							<li class={styles.emptyThread}>No messages yet. Try “list”.</li>
						{/if}
						{@render bubbles(owner, messages, true)}
					</ol>

					<div class={styles.composer}>
						<label for="sms-body" class="sr-only">Message</label>
						{#if multiline}
							<textarea
								id="sms-body"
								name="body"
								rows="4"
								maxlength="1600"
								placeholder="Text message"
								bind:value={body}
								bind:this={bodyInput}
								aria-describedby={form?.error
									? 'sms-error sms-multiline-hint'
									: 'sms-multiline-hint'}
								onkeydown={(e) => {
									if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
										e.preventDefault();
										e.currentTarget.form?.requestSubmit();
									}
								}}></textarea>
						{:else}
							<input
								id="sms-body"
								name="body"
								autocomplete="off"
								maxlength="1600"
								placeholder="Text message"
								list="sms-options"
								bind:value={body}
								bind:this={bodyInput}
								aria-describedby={form?.error ? 'sms-error' : undefined}
							/>
						{/if}
						<datalist id="sms-options">
							{#each data.options as option (option)}
								<option value={option}></option>
							{/each}
						</datalist>
						<button type="submit">Send</button>
					</div>
					{#if form?.error}<p id="sms-error" class={styles.error} role="alert">{form.error}</p>{/if}

					<label class={styles.check}>
						<input
							type="checkbox"
							bind:checked={multiline}
							onchange={() => setTimeout(() => bodyInput?.focus())}
						/>
						Multi-line message
					</label>
					{#if multiline}
						<p id="sms-multiline-hint" class={[styles.hint, styles.devicePad]}>
							Ctrl+Enter sends. Suggestions only work in single-line mode.
						</p>
					{/if}

					<label class={styles.check}>
						<input type="checkbox" name="save" checked />
						Save changes to the local database
					</label>
				</form>

				{#if data.suggestions.length > 0}
					<div class={styles.suggestions}>
						<span id="suggest-label">Try:</span>
						<ul aria-labelledby="suggest-label">
							{#each data.suggestions as suggestion (suggestion)}
								<li>
									<button type="button" class="secondary" onclick={() => suggest(suggestion)}>
										<code>{suggestion}</code>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				<p class={styles.hint}>
					Untick “Save changes” to preview claims, adds and requests without changing anything.
					Reset the demo data with <code>npm run db:reset:local</code>.
				</p>
			</div>

			<section class={styles.trace} aria-labelledby="trace-heading">
				<h3 id="trace-heading" class={styles.traceTitle}>Step through</h3>
				{#if !shown}
					<p class={styles.hint}>
						Send a text to see each step: what Twilio sends, who the sender is, how the command is
						read, what’s checked and saved, and the TwiML that goes back.
					</p>
				{:else}
					<p class={styles.traceFor}>
						<strong>{shown.fromName}</strong> texted <q>{shown.body}</q>
						{#if !shown.saved}<Pill colour="navy">Preview only</Pill>{/if}
					</p>
					<ol class={styles.steps}>
						{#each shown.trace as step, i (i)}
							<li class={styles.step} data-kind={step.kind ?? 'info'}>
								<span class={styles.stepNumber} aria-hidden="true">{i + 1}</span>
								<div class={styles.stepBody}>
									<strong>{step.title}</strong>
									{#if step.code}<code class={styles.stepCode}>{step.code}</code>{/if}
									{#if step.detail}<span>{step.detail}</span>{/if}
								</div>
							</li>
						{/each}
					</ol>

					<h4 class={styles.subTitle}>Response to Twilio</h4>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<pre class={styles.code} tabindex="0" aria-label="TwiML response"><code
							>{shown.twiml}</code
						></pre>

					<h4 class={styles.subTitle}>What changed</h4>
					{#if shown.changes.length === 0}
						<p class={styles.hint}>Nothing. This text only read data.</p>
					{:else}
						<ul class={styles.log}>
							{#each shown.changes as change (change)}
								<li>
									{change}
									<Pill colour={shown.saved ? 'green' : 'navy'}>
										{shown.saved ? 'Saved' : 'Preview only'}
									</Pill>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}

				{#if exchanges.length > 0}
					<form
						method="POST"
						action="?/reset"
						use:enhance={() =>
							async ({ update }) => {
								history = [];
								seen = {};
								selectedId = null;
								await update();
							}}
					>
						<button type="submit" class="secondary">Clear all phones</button>
					</form>
				{/if}
			</section>
		</div>
	</section>

	<section aria-labelledby="commands-heading">
		<h2 id="commands-heading">Commands</h2>
		<p>
			Commands aren’t case-sensitive. Names match the start of any part of a name, so “list mia”,
			“list Mia” and “list june” all work. Replies are plain text in the GSM-7 character set, so
			each costs one SMS segment per 160 characters.
		</p>
		<!-- Scrollable regions need to be focusable so keyboard users can scroll them. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class={styles.tableWrap} role="region" aria-label="Command reference table" tabindex="0">
			<table>
				<thead>
					<tr>
						<th scope="col">Text</th>
						<th scope="col">What it does</th>
						<th scope="col">Example</th>
					</tr>
				</thead>
				<tbody>
					{#each data.commands as command (command.format)}
						<tr>
							<td><code>{command.format}</code></td>
							<td>{command.does}</td>
							<td><code>{command.example}</code></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<details class={styles.examples}>
		<summary><h2 class={styles.examplesTitle}>Example conversations</h2></summary>
		{#if data.missing}
			<EmptyState><p>{data.missing}</p></EmptyState>
		{:else}
			<div class={styles.scenarios}>
				{#each data.scenarios as scenario (scenario.id)}
					<Card
						tag="article"
						theme="white"
						class={styles.scenario}
						aria-labelledby="{scenario.id}-title"
					>
						<h3 id="{scenario.id}-title" class={styles.scenarioTitle}>{scenario.title}</h3>
						<p class={styles.description}>{scenario.description}</p>
						<div class={styles.phones}>
							{#each scenario.phones as phone (phone.owner)}
								<figure class={styles.phone}>
									<figcaption class={styles.phoneHead}>
										<strong>
											{phone.owner === 'Unknown number' ? phone.owner : `${phone.owner}’s phone`}
										</strong>
										<span>{phone.number}</span>
									</figcaption>
									<ol class={styles.thread}>
										{@render bubbles(phone.owner, phone.messages, false)}
									</ol>
								</figure>
							{/each}
						</div>
					</Card>
				{/each}
			</div>
		{/if}
	</details>
</div>
