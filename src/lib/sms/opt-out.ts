import type { SmsKind } from '@/lib/sms/templates'

/**
 * Who has asked us to stop, and the keyword Twilio does not recognise.
 *
 * TWILIO'S BUILT-IN OPT-OUT DOES NOT COVER THIS AUDIENCE, and that is the
 * finding this file exists for. Twilio intercepts `STOP`, `STOPALL`,
 * `UNSUBSCRIBE`, `CANCEL`, `END` and `QUIT` on a long code and blocks the
 * number itself. Every one of those is English. An Israeli customer who wants
 * out replies **הסר**, which Twilio forwards to the webhook as an ordinary
 * inbound message and does nothing about.
 *
 * So a shop that relies on the carrier's own handling has an opt-out that works
 * for the customers who would never have used it and fails for the ones who do.
 * Under Israeli law (תיקון 40 לחוק התקשורת) the customer's request is what
 * counts, not whether it was phrased in a language the vendor's default list
 * happens to contain.
 *
 * BOTH LISTS ARE HONOURED. The English keywords are matched here too even
 * though Twilio also acts on them, because Twilio's block is per (customer
 * number, sender number): move to a second sender and its list starts empty,
 * while `sms_opt_outs` is ours and moves with us.
 *
 * A KEYWORD IS THE WHOLE MESSAGE, NOT A SUBSTRING. Matching a substring would
 * turn "מתי אפשר להסר את המדבקה מהקופון" into an opt-out, and the customer
 * would never learn why the messages stopped.
 */

/** Twilio's own list, matched again because their block does not travel. */
const ENGLISH_STOP = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']

/**
 * What an Israeli customer actually sends. `הסר`/`הסרה` is the standard
 * Hebrew opt-out and appears on every compliant Israeli marketing SMS;
 * `הפסק` and `בטל` are the other two forms people reach for.
 */
const HEBREW_STOP = ['הסר', 'הסרה', 'להסיר', 'הפסק', 'הפסיקו', 'בטל', 'ביטול']

/** Twilio's resubscribe keywords, plus the Hebrew a customer would use. */
const ENGLISH_START = ['start', 'yes', 'unstop']
const HEBREW_START = ['הצטרף', 'הצטרפות', 'התחל', 'כן']

export type OptOutIntent = 'stop' | 'start' | null

/**
 * Normalises an inbound body to a single comparable token.
 *
 * Trimmed, lowercased, and stripped of the punctuation people add ("STOP.",
 * "הסר!"). Hebrew niqqud is stripped too: a keyboard that adds it produces a
 * string that is visually identical to the bare word and compares unequal.
 */
function normalise(body: string): string {
  return body
    .trim()
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.!?,;:"'׳״\s]+$/g, '')
}

export function optOutIntentOf(body: string | null | undefined): OptOutIntent {
  if (!body) return null
  const token = normalise(body)
  if (token === '') return null

  if (ENGLISH_STOP.includes(token) || HEBREW_STOP.includes(token)) return 'stop'
  if (ENGLISH_START.includes(token) || HEBREW_START.includes(token)) return 'start'
  return null
}

/**
 * The kinds an opt-out does NOT silence.
 *
 * ONE EXEMPTION, AND IT IS NOT A LOOPHOLE. An OTP is not something we send to
 * a customer; it is something the customer asked for by pressing a button
 * seconds earlier. Suppressing it would lock somebody out of their own account
 * over a `STOP` they sent two years ago, and there is no way for them to
 * discover the cause.
 *
 * Everything else is silenced, including the coupon code. That is a real cost
 * -- a customer who opted out and then buys a coupon does not get it by SMS --
 * and it is the right cost: the coupon is in their account, in their email and
 * in the app, and honouring "stop" only when it is cheap is not honouring it.
 */
export function isOptOutExempt(kind: SmsKind): boolean {
  return kind === 'otp'
}

/**
 * The Hebrew confirmation sent back when somebody opts out.
 *
 * Sent once, and it is the last message that number receives. A confirmation
 * is not optional politeness: without one the customer does not know whether
 * the word they sent was understood, and the usual next step is to send it
 * again, in a different form, and then to complain.
 */
export const OPT_OUT_CONFIRMATION = 'הוסרתם מרשימת ההודעות. לחידוש שלחו: הצטרף'

/** And the other direction, so a resubscribe is equally acknowledged. */
export const OPT_IN_CONFIRMATION = 'חזרתם לרשימת ההודעות. להסרה שלחו: הסר'
