import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

export type SmsOtpResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string }

/** One sign-in code over Twilio SMS, the fallback when WhatsApp cannot deliver. */
export async function sendSmsOtp(
  phoneE164: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SmsOtpResult> {
  const sid = env.TWILIO_ACCOUNT_SID
  const token = env.TWILIO_AUTH_TOKEN
  const from = env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from)
    return { ok: false, skipped: true, reason: 'TWILIO_* not configured' }
  const res = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneE164,
        From: from,
        Body: `קוד הכניסה שלך לקניון EXPRESS: ${code} (תקף ל-10 דקות)`,
      }),
    },
  ).catch((err: unknown) => err as Error)
  if (res instanceof Error) return { ok: false, reason: res.message }
  return res.ok ? { ok: true } : { ok: false, reason: `twilio_${res.status}` }
}
