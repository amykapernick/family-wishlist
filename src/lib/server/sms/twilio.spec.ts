import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isValidTwilioRequest, sendSms, toTwiml, twilioConfig, twilioSignature } from './twilio.ts';

describe('TwiML replies', () => {
	it('wraps the message and escapes XML', () => {
		const xml = toTwiml("Claimed 'Socks & sandals' <2>");
		expect(xml).toContain('<Response>');
		expect(xml).toContain('<Message>Claimed &apos;Socks &amp; sandals&apos; &lt;2&gt;</Message>');
	});

	it('sends nothing back when there is no message', () => {
		expect(toTwiml(null)).toContain('<Response></Response>');
		expect(toTwiml(null)).not.toContain('<Message>');
	});
});

describe('Twilio request signatures', () => {
	const url = 'https://wishlist.example/api/sms';
	const params: [string, string][] = [
		['To', '+61400999000'],
		['Body', 'list mia'],
		['From', '+61400000001'],
		['MessageSid', 'SM123']
	];
	// Twilio's algorithm, done independently: URL + sorted name/value pairs.
	const expected = createHmac('sha1', 'secret-token')
		.update(url + 'Bodylist miaFrom+61400000001MessageSidSM123To+61400999000')
		.digest('base64');

	it('matches Twilio’s HMAC-SHA1 algorithm', async () => {
		expect(await twilioSignature('secret-token', url, params)).toBe(expected);
	});

	it('accepts a correct signature and rejects anything else', async () => {
		expect(await isValidTwilioRequest('secret-token', url, params, expected)).toBe(true);
		expect(await isValidTwilioRequest('wrong-token', url, params, expected)).toBe(false);
		expect(await isValidTwilioRequest('secret-token', url + '?x=1', params, expected)).toBe(false);
		const tampered: [string, string][] = [...params.slice(1), ['Body', 'list leo']];
		expect(await isValidTwilioRequest('secret-token', url, tampered, expected)).toBe(false);
		expect(await isValidTwilioRequest('secret-token', url, params, null)).toBe(false);
	});
});

describe('Twilio config', () => {
	it('needs the account SID, auth token and number', () => {
		expect(twilioConfig({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' })).toBeNull();
		expect(
			twilioConfig({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+61' })
		).toMatchObject({ accountSid: 'AC1', fromNumber: '+61' });
	});
});

describe('sending texts', () => {
	const config = { accountSid: 'AC1', authToken: 'tok', fromNumber: '+61400999000' };

	it('posts to the Messages API with basic auth', async () => {
		const fetcher = vi.fn(async () => new Response('{}', { status: 201 }));
		expect(await sendSms(config, '+61400000002', 'Hi', fetcher)).toEqual({ ok: true });
		const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
		expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('AC1:tok')}`);
		expect(String(init.body)).toBe('To=%2B61400000002&From=%2B61400999000&Body=Hi');
	});

	it('reports failures instead of throwing', async () => {
		const fetcher = vi.fn(async () => new Response('bad number', { status: 400 }));
		expect(await sendSms(config, 'x', 'Hi', fetcher)).toEqual({
			ok: false,
			error: 'Twilio 400: bad number'
		});
	});
});
