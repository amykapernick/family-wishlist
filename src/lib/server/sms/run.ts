// One incoming text, end to end apart from Twilio itself: load the phone's
// last list, run handleSms(), and save the new last list. The webhook
// (POST /api/sms) and the dev sandbox (/dev/sms) both go through here.

import { getSmsContext, saveSmsContext } from '../db.ts';
import { handleSms, type SmsRequest, type SmsResult } from './handle.ts';

export async function runSms(
	db: D1Database,
	request: Omit<SmsRequest, 'context'>
): Promise<SmsResult> {
	const phone = request.from.trim();
	const context = await getSmsContext(db, phone);
	const result = await handleSms(db, { ...request, from: phone, context });
	if (result.sender && result.context !== undefined) {
		await saveSmsContext(db, phone, result.context);
	}
	return result;
}
