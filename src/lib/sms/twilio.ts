import { measureSms } from '@/lib/sms/segments'

/**
 * Twilio SMS, over fetch. No SDK: this is one form-encoded POST, and a
 * dependency in the path that messages customers is a dependency audited
 * forever. Same call the WhatsApp client makes, with a different `From`.
 *
 * THIS FILE USED TO BE A REFUSING STUB, AND THE ARGUMENT FOR THE REFUSAL IS
 * STILL TRUE. It is worth restating rather than deleting, because it is the
 * reason for the flag below:
 *
 *   **Israel requires a registered sender.** A business SMS to an Israeli
 *   mobile has to come from an approved alphanumeric sender ID or a registered
 *   number. Messages from an unregistered sender are dropped by the carriers
 *   WITHOUT A BOUNCE -- Twilio reports `queued`, then `delivered`, the phone
 *   never rings, and nothing on either side says so. That is worse than not
 *   sending, because it is invisible and it spends the customer's trust in the
 *   channel silently.
 *
 * What changed is not the risk; it is where the guard lives. The stub made
 * "unimplemented" the guard, which meant the code could not be reviewed,
 * tested or costed until the day somebody needed it in a hurry. The guard is
 * now `SMS_ENABLED` plus `TWILIO_SMS_FROM`, both absent everywhere today, so
 * the behaviour is byte for byte what it was -- `sendSms` skips with a reason
 * -- while the fifteen lines that will run on registration day exist, are
 * tested against a mocked Twilio, and have their segment arithmetic checked.
 *
 * THE FLAG IS A SEPARATE CONDITION FROM THE CREDENTIALS ON PURPOSE. Credentials
 * arrive for WhatsApp; `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are already
 * shared. Without a flag, the day a `TWILIO_SMS_FROM` is set for a test the
 * whole notification queue would start sending SMS to real customers from a
 * sender nobody registered. Two locks, because one of them is a variable
 * somebody could plausibly set for another reason.
 */

const API = 'https://api.twilio.com/2010-04-01'

export type SmsSendResult =
  | { ok: true; sid: string; segments: number }
  /** Nothing was attempted. Not a failure of the message: do not retry, do not count. */
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string }

type Creds = { accountSid: string; authToken: string; from: string }

function creds(env: NodeJS.ProcessEnv = process.env): Creds | null {
  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  // A DIFFERENT variable from `TWILIO_WHATSAPP_FROM`, on purpose. They are
  // different senders with different registrations, and sharing one would mean
  // configuring WhatsApp silently enabled SMS from a number not approved for it.
  const from = env.TWILIO_SMS_FROM
  if (!accountSid || !authToken || !from) return null
  return { accountSid, authToken, from }
}

/** The master switch. Anything but the exact string `true` leaves SMS off. */
export function isSmsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SMS_ENABLED === 'true'
}

export function isSmsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSmsEnabled(env) && creds(env) !== null
}

/**
 * An Israeli MOBILE in E.164, or null.
 *
 * MOBILE, and the distinction is not pedantry: an SMS to an Israeli landline
 * is accepted by Twilio, billed, and delivered nowhere. The prefix `05` is what
 * makes a number reachable, so `03`, `04`, `08`, `09`, `07x` and the 1-800
 * ranges are refused here rather than paid for.
 *
 * Accepts the four forms the profiles table actually holds -- `05X-XXX-XXXX`,
 * `05XXXXXXXX`, `+9725XXXXXXXX`, `9725XXXXXXXX` -- and returns null for
 * anything else rather than guessing. A message pushed to a wrong number is
 * worse than one not sent, and in SMS it is also a message read by a stranger.
 */
export function toSmsAddress(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (/^05\d{8}$/.test(digits)) return `+972${digits.slice(1)}`
  if (/^9725\d{8}$/.test(digits)) return `+${digits}`
  return null
}

/**
 * Send one SMS.
 *
 * `skipped` and not `error` when nothing was attempted, matching the WhatsApp
 * result and the invoice queue: a caller must be able to tell "we could not
 * try" from "we tried and it failed", because only the second is worth
 * retrying and only the first is worth telling an operator about.
 */
export async function sendSms(args: {
  /** An E.164 address from `toSmsAddress`. */
  to: string
  body: string
  /**
   * Where Twilio posts the delivery receipt. Without it a message's real fate
   * is unknowable: the POST response says `queued`, which is not delivery, and
   * `price` is null until the receipt arrives.
   */
  statusCallback?: string
  env?: NodeJS.ProcessEnv
}): Promise<SmsSendResult> {
  const env = args.env ?? process.env

  if (!isSmsEnabled(env)) {
    return { ok: false, skipped: true, reason: 'SMS_ENABLED is not "true"' }
  }

  const configured = creds(env)
  if (!configured) {
    return {
      ok: false,
      skipped: true,
      reason: 'TWILIO_SMS_FROM is not set: no registered Israeli sender exists yet.',
    }
  }

  const size = measureSms(args.body)

  const body = new URLSearchParams({
    From: configured.from,
    To: args.to,
    Body: args.body,
  })
  if (args.statusCallback) body.set('StatusCallback', args.statusCallback)

  let res: Response
  try {
    res = await fetch(`${API}/Accounts/${configured.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${configured.accountSid}:${configured.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
  } catch (error) {
    // A transport failure is worth retrying; it is not a skip.
    return { ok: false, error: error instanceof Error ? error.message : 'network error' }
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: `twilio ${res.status}: ${detail.slice(0, 200)}` }
  }

  const json = (await res.json().catch(() => ({}))) as { sid?: string; num_segments?: string }

  // Twilio's own count is preferred where it gives one, and ours is the
  // fallback. They should agree; where they do not, Twilio's is what is
  // billed, and a disagreement is worth seeing in the log rather than
  // averaging away.
  const reported = Number(json.num_segments)
  return {
    ok: true,
    sid: json.sid ?? '',
    segments: Number.isFinite(reported) && reported > 0 ? reported : size.segments,
  }
}
