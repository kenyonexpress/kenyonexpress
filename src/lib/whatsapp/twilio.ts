import 'server-only'

/**
 * Twilio WhatsApp, over fetch. No SDK -- the same reasoning as
 * src/lib/growth/resend.ts: this is one REST call, and a dependency in the
 * path that messages customers is a dependency audited forever.
 *
 * ENTIRELY INERT WITHOUT TWILIO_*. Every function returns a skipped result
 * rather than throwing: local development, CI and the production deploy that
 * predates the Twilio account all run this code with zero credentials, and a
 * missing token must never take down the outbox drain that happens to
 * trigger a send.
 *
 * TEMPLATES, NOT FREE TEXT. Outside a 24-hour customer-service window
 * WhatsApp delivers only pre-approved content templates, so the send names a
 * ContentSid and variables, never a body. The SIDs arrive by env once Ofir's
 * templates are approved (STATE.md blocker); until then the sender is
 * configured-but-templateless and still skips.
 */

const API = 'https://api.twilio.com/2010-04-01'

export type WhatsappSendResult =
  | { ok: true; sid: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string }

type Creds = { accountSid: string; authToken: string; from: string }

function creds(env: NodeJS.ProcessEnv = process.env): Creds | null {
  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  const from = env.TWILIO_WHATSAPP_FROM
  if (!accountSid || !authToken || !from) return null
  return { accountSid, authToken, from }
}

export function isWhatsappConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return creds(env) !== null
}

/**
 * An Israeli phone as WhatsApp wants it: `whatsapp:+9725XXXXXXXX`.
 *
 * Accepts the forms the profiles table actually holds -- `05X-XXX-XXXX`,
 * `05XXXXXXXX`, `+9725XXXXXXXX`, `9725XXXXXXXX` -- and returns null for
 * anything else rather than guessing: a template pushed to a wrong number is
 * worse than one not sent.
 */
export function toWhatsappAddress(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (/^05\d{8}$/.test(digits)) return `whatsapp:+972${digits.slice(1)}`
  if (/^9725\d{8}$/.test(digits)) return `whatsapp:+${digits}`
  return null
}

export async function sendWhatsappTemplate(args: {
  /** A `whatsapp:+E164` address, from toWhatsappAddress. */
  to: string
  /** The approved content template's SID (HX...). */
  contentSid: string
  /** Positional template variables, e.g. { '1': code, '2': date }. */
  variables: Record<string, string>
}): Promise<WhatsappSendResult> {
  const c = creds()
  if (!c) return { ok: false, skipped: true }

  const body = new URLSearchParams({
    From: c.from,
    To: args.to,
    ContentSid: args.contentSid,
    ContentVariables: JSON.stringify(args.variables),
  })

  const res = await fetch(`${API}/Accounts/${c.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: `twilio ${res.status}: ${detail.slice(0, 200)}` }
  }
  const json = (await res.json()) as { sid?: string }
  return { ok: true, sid: json.sid ?? '' }
}
