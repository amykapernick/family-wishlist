import { error } from '@sveltejs/kit';
import { waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/session.ts';
import { runSms } from '#lib/server/sms/run.ts';
import { isValidTwilioRequest, sendSms, toTwiml, twilioConfig } from '#lib/server/sms/twilio.ts';

// The Twilio webhook. Public (no family cookie): every request must carry a
// valid X-Twilio-Signature instead. Replies are TwiML; texts to anyone else
// go out through the REST API after the reply, so Twilio isn't kept waiting.

const twiml = (message: string | null) =>
	new Response(toTwiml(message), { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	const config = twilioConfig(env as unknown as Record<string, unknown>);
	if (!config) error(503, 'SMS isn’t set up. See README "Text messages".');

	const form = await event.request.formData();
	const params = [...form.entries()].filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string'
	);
	const url = config.webhookUrl ?? event.url.href;
	const signature = event.request.headers.get('x-twilio-signature');
	if (!(await isValidTwilioRequest(config.authToken, url, params, signature))) {
		error(403, 'Invalid signature');
	}

	const from = String(form.get('From') ?? '');
	const body = String(form.get('Body') ?? '');
	try {
		const result = await runSms(env.DB, {
			from,
			text: body,
			link: `${new URL(url).origin}/join/${env.FAMILY_TOKEN}`,
			save: true
		});
		if (result.outbound.length > 0) {
			waitUntil(
				Promise.all(
					result.outbound.map(async (text) => {
						const sent = await sendSms(config, text.phone, text.text);
						if (!sent.ok) console.error(`SMS to ${text.name} failed: ${sent.error}`);
					})
				)
			);
		}
		return twiml(result.reply);
	} catch (err) {
		console.error('SMS webhook failed', err);
		return twiml('Sorry, something went wrong. Please try again, or use the website.');
	}
};
