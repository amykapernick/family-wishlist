// Talking to Twilio: checking that a webhook call really came from Twilio,
// replying with TwiML, and sending texts to other people through the REST API.
// Pure WebCrypto and fetch, so it runs on Workers and in tests.

import { timingSafeEqual } from '../crypto.ts';

export interface TwilioConfig {
	accountSid: string;
	authToken: string;
	/** The family number texts come from, in E.164. */
	fromNumber: string;
	/**
	 * The webhook URL as configured in Twilio, if it differs from the URL the
	 * Worker sees (for example behind a tunnel in local testing).
	 */
	webhookUrl?: string;
}

/** Reads the Twilio secrets, or null if SMS isn't set up. */
export function twilioConfig(env: Record<string, unknown>): TwilioConfig | null {
	const get = (key: string) => (typeof env[key] === 'string' && env[key] ? env[key] : null);
	const accountSid = get('TWILIO_ACCOUNT_SID');
	const authToken = get('TWILIO_AUTH_TOKEN');
	const fromNumber = get('TWILIO_FROM_NUMBER');
	if (!accountSid || !authToken || !fromNumber) return null;
	return { accountSid, authToken, fromNumber, webhookUrl: get('TWILIO_WEBHOOK_URL') ?? undefined };
}

/**
 * Twilio's request signature: HMAC-SHA1 (keyed with the auth token) of the
 * full URL followed by every POST parameter as name then value, sorted by
 * name, base64 encoded.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export async function twilioSignature(
	authToken: string,
	url: string,
	params: Iterable<[string, string]>
): Promise<string> {
	const sorted = [...params].sort(([a, av], [b, bv]) =>
		a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1
	);
	const data = url + sorted.map(([name, value]) => name + value).join('');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(authToken),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function isValidTwilioRequest(
	authToken: string,
	url: string,
	params: Iterable<[string, string]>,
	signature: string | null
): Promise<boolean> {
	if (!signature) return false;
	return timingSafeEqual(await twilioSignature(authToken, url, params), signature);
}

const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;'
};

export function escapeXml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * The webhook's response body: Twilio texts `message` back to the sender.
 * With no message, an empty response tells Twilio not to reply at all.
 */
export function toTwiml(message: string | null): string {
	const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
	if (message === null) return `${head}<Response></Response>`;
	return `${head}<Response>\n  <Message>${escapeXml(message)}</Message>\n</Response>`;
}

/** Sends one text through the REST API. Never throws: failures are returned. */
export async function sendSms(
	config: TwilioConfig,
	to: string,
	body: string,
	fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; error?: string }> {
	try {
		const response = await fetcher(
			`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
			{
				method: 'POST',
				headers: {
					Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({ To: to, From: config.fromNumber, Body: body })
			}
		);
		if (response.ok) return { ok: true };
		return { ok: false, error: `Twilio ${response.status}: ${await response.text()}` };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
