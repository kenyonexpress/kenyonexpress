/**
 * SMS, as a refusing stub with the shape the real one will have.
 *
 * WHY A STUB AND NOT AN IMPLEMENTATION
 *
 * Not difficulty. Twilio's SMS endpoint is the same `Messages` resource
 * `sendWhatsappTemplate` already posts to, with a different `From`; the HTTP
 * call is fifteen lines. What is missing is the thing that makes those fifteen
 * lines legal to run.
 *
 * **Israel requires a registered sender.** A business SMS to an Israeli mobile
 * has to come from an approved alphanumeric sender ID or a registered number,
 * and messages from an unregistered sender are dropped by the carriers without
 * a bounce -- Twilio reports `delivered`, the phone never rings, and nothing on
 * either side says so. That is a worse failure than not sending, because it is
 * invisible and it consumes the customer's trust in the channel silently.
 *
 * **And SMS is the wrong channel here anyway, for now.** Every message this
 * system sends has an email path and most have a WhatsApp path, and WhatsApp is
 * what Israeli customers actually answer -- the reason `buildSupplierContact`
 * exists and the reason 173 was built. SMS earns its place when there is a
 * message that must arrive on a phone with no data connection, which is a real
 * case (a redemption code at a counter with no reception) and is not one
 * anything currently sends.
 *
 * SO WHAT IS THIS FOR
 *
 * The shape. A caller that needs SMS can be written against this today and
 * will not have to change when the sender is registered: `isSmsConfigured`
 * answers honestly, `toSmsAddress` normalises the same phone formats the
 * profiles table actually holds, and `sendSms` refuses with a reason rather
 * than throwing or pretending. It is the same discipline as the Green Invoice
 * and iCount adapters -- a stub that refuses beats a client written against
 * documentation nobody has opened.
 */

export type SmsSendResult =
  | { ok: true; sid: string }
  /** Nothing was attempted: no sender is configured. Not a failure of the message. */
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string }

type Creds = { accountSid: string; authToken: string; from: string }

function creds(env: NodeJS.ProcessEnv = process.env): Creds | null {
  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  // A DIFFERENT variable from `TWILIO_WHATSAPP_FROM`, on purpose. They are
  // different senders with different registrations, and sharing one variable
  // would mean configuring WhatsApp silently enabled SMS from a number that is
  // not approved to send it.
  const from = env.TWILIO_SMS_FROM
  if (!accountSid || !authToken || !from) return null
  return { accountSid, authToken, from }
}

export function isSmsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return creds(env) !== null
}

/**
 * An Israeli mobile in E.164, or null.
 *
 * The same four forms `toWhatsappAddress` accepts, because they come from the
 * same column, and the same refusal to guess: a message pushed to a wrong
 * number is worse than one not sent.
 */
export function toSmsAddress(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (/^05\d{8}$/.test(digits)) return `+972${digits.slice(1)}`
  if (/^9725\d{8}$/.test(digits)) return `+${digits}`
  return null
}

/**
 * Send one SMS. Today: always skipped, with the reason.
 *
 * `skipped` and not `error`, matching the WhatsApp result and the invoice
 * queue: a caller must be able to tell "we could not try" from "we tried and it
 * failed", because only the second is worth retrying and only the first is
 * worth telling an operator about.
 */
export async function sendSms(args: {
  /** An E.164 address from `toSmsAddress`. */
  to: string
  body: string
  env?: NodeJS.ProcessEnv
}): Promise<SmsSendResult> {
  const configured = creds(args.env ?? process.env)
  if (!configured) {
    return {
      ok: false,
      skipped: true,
      reason: 'TWILIO_SMS_FROM is not set: no registered Israeli sender exists yet.',
    }
  }

  // Deliberately unreachable while `TWILIO_SMS_FROM` is unset, and deliberately
  // not written. Posting to the Messages endpoint from an unregistered sender
  // returns `queued`, then `delivered`, and the phone never rings -- so an
  // implementation that looks correct here would be the exact invisible failure
  // this file exists to avoid. It is fifteen lines on the day the sender is
  // approved, and none of them should be guessed before then.
  return {
    ok: false,
    skipped: true,
    reason: 'SMS sending is not implemented: register an Israeli sender ID first.',
  }
}
