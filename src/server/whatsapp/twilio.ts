import { createHmac, timingSafeEqual } from 'node:crypto'
import { log } from '@/lib/observability/log'

/**
 * Outbound WhatsApp through Twilio, plus the inbound signature check.
 *
 * WHY IT NEVER THROWS. Same contract as `lib/email/resend.ts`, and for the
 * same reason: every caller sits after something that already happened (an
 * order changed status, a customer wrote to us). An unreachable messaging
 * provider must not fail that flow; the outbox row carries the retry.
 *
 * WHY AN ABSENT CREDENTIAL IS NOT AN ERROR. Without the three TWILIO_* vars
 * this reports `skipped` and says so once per process. Local development and
 * CI have no Twilio account and should not have one.
 *
 * The API is called directly with `fetch`; the `twilio` npm package would add
 * a dependency for what is one form-encoded POST and one HMAC.
 */

export interface TwilioWhatsAppEnv {
  accountSid: string
  authToken: string
  /** The sending number in E.164, e.g. `+14155238886`, without `whatsapp:`. */
  fromNumber: string
}

/** All three or nothing: a partial credential can only half-work in production. */
export function loadTwilioEnv(env: NodeJS.ProcessEnv = process.env): TwilioWhatsAppEnv | null {
  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  const fromNumber = env.TWILIO_WHATSAPP_FROM
  if (!accountSid || !authToken || !fromNumber) return null
  return { accountSid, authToken, fromNumber }
}

/**
 * Validates Twilio's `X-Twilio-Signature` header.
 *
 * The scheme is Twilio's own: concatenate the exact public URL Twilio was
 * given with every POST parameter, sorted by name, as `name + value` with no
 * separators; HMAC-SHA1 that with the auth token; base64. The URL must be the
 * one configured in the Twilio console, which behind Vercel's proxy is not
 * `request.url`, so the caller passes it in (built from NEXT_PUBLIC_APP_URL).
 */
export function twilioSignatureValid(
  authToken: string,
  signatureHeader: string | null,
  publicUrl: string,
  params: Record<string, string>,
): boolean {
  if (!signatureHeader) return false

  const data =
    publicUrl +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('')

  const expected = createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest()

  let provided: Buffer
  try {
    provided = Buffer.from(signatureHeader, 'base64')
  } catch {
    return false
  }
  if (provided.length !== expected.length || expected.length === 0) return false
  return timingSafeEqual(provided, expected)
}

export type SendWhatsAppResult =
  | { ok: true; sid: string | null; skipped?: false }
  | { ok: false; skipped: true; reason: 'not_configured' }
  | { ok: false; skipped?: false; reason: string }

let missingCredentialReported = false

/**
 * Sends one WhatsApp message. `toDigits` is international digits with no `+`,
 * the shape `normalizeIsraeliPhone` produces, e.g. `972501234567`.
 */
export async function sendWhatsAppMessage(
  toDigits: string,
  body: string,
  env: TwilioWhatsAppEnv | null = loadTwilioEnv(),
): Promise<SendWhatsAppResult> {
  if (!env) {
    if (!missingCredentialReported) {
      missingCredentialReported = true
      log.warn('whatsapp.disabled', { reason: 'TWILIO_* env vars are not set' })
    }
    return { ok: false, skipped: true, reason: 'not_configured' }
  }

  try {
    const form = new URLSearchParams({
      From: `whatsapp:${env.fromNumber}`,
      To: `whatsapp:+${toDigits}`,
      Body: body,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${env.accountSid}:${env.authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      log.error('whatsapp.refused', { status: response.status, detail: detail.slice(0, 300) })
      return { ok: false, reason: `http_${response.status}` }
    }

    const json = (await response.json().catch(() => null)) as { sid?: string } | null
    return { ok: true, sid: json?.sid ?? null }
  } catch (error) {
    log.error('whatsapp.send_failed', { err: error })
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' }
  }
}
