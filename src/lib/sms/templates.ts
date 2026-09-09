import { smsSegments } from '@/lib/sms/segments'

/**
 * The five SMS this system may send, in Hebrew, written to a segment budget.
 *
 * A KIND WITHOUT A TEMPLATE HERE GETS NO SMS. Same gate as
 * `lib/push/templates.ts`: the outbox carries every notification the system
 * owes, including supplier and admin alerts, and none of those belong on a
 * customer's phone bill.
 *
 * EVERY ONE OF THESE IS TWO OR THREE SEGMENTS, NOT ONE. Hebrew forces UCS-2, so
 * the budget is 70 characters for a single-segment message and 67 per part
 * after that -- see `segments.ts`. The copy below is written against that, and
 * `templates.test.ts` asserts a ceiling per kind, because a template that grew
 * by one word and silently became a third segment is a 50% cost increase
 * nobody would notice.
 *
 * NO URLS EXCEPT WHERE THE MESSAGE IS USELESS WITHOUT ONE. A link in an SMS is
 * long, unclickable in some Israeli carriers' clients, and is the exact shape
 * of every smishing message a customer has ever received. Where the customer
 * has to go somewhere, the message names the place ("באזור האישי") rather than
 * carrying a URL they cannot verify.
 *
 * THE OTP TEMPLATE IS DELIBERATELY DIFFERENT FROM THE OTHERS in three ways,
 * and each is a security property rather than a style choice. See `otpCode`.
 */

export type SmsKind =
  | 'voucher_issued'
  | 'voucher_expiring'
  | 'order_shipped'
  | 'refund_completed'
  | 'otp'

export interface SmsMessage {
  kind: SmsKind
  body: string
  /** Computed here so a caller can budget or refuse before the money is spent. */
  segments: number
}

function message(kind: SmsKind, body: string): SmsMessage {
  return { kind, body, segments: smsSegments(body) }
}

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function integer(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  return null
}

/** Agorot to shekels, dropping a `.00` that only costs characters. */
function shekels(agorotValue: number): string {
  const whole = Math.trunc(Math.abs(agorotValue) / 100)
  const fraction = Math.abs(agorotValue) % 100
  return fraction === 0 ? `₪${whole}` : `₪${whole}.${String(fraction).padStart(2, '0')}`
}

/**
 * The coupon code itself.
 *
 * THE ONE MESSAGE SMS IS ACTUALLY BETTER AT THAN EVERY OTHER CHANNEL, and the
 * reason this file exists at all: a customer standing at a counter with no data
 * connection can read an SMS. They cannot open an email, a push notification or
 * a WhatsApp message. The code goes IN THE BODY for exactly that reason -- a
 * link to it would defeat the whole point.
 *
 * The code is isolated with U+2068/U+2069 (first-strong isolate) so an LTR code
 * inside an RTL sentence renders in the order it was issued in. This project
 * has already shipped a reversed Hebrew OG image with a green build; a reversed
 * coupon code is the same failure where the customer is the one who finds it,
 * at a till, with a queue behind them.
 */
function voucherIssued(payload: Record<string, unknown>): SmsMessage | null {
  const code = text(payload, 'code')
  if (!code) return null
  const product = text(payload, 'product_name')

  const body = product
    ? `הקופון שלך ל${product} מוכן. קוד: ⁨${code}⁩`
    : `הקופון שלך מוכן. קוד: ⁨${code}⁩`
  return message('voucher_issued', body)
}

/**
 * T minus one day, and no earlier.
 *
 * The goal names "voucher expiry T-1". Refusing anything else is the point: a
 * reminder seven days out is a marketing message wearing a transactional
 * badge, and it is the kind of send that gets a sender ID reported.
 */
function voucherExpiring(payload: Record<string, unknown>): SmsMessage | null {
  const days = integer(payload, 'days_remaining')
  if (days === null || days > 1 || days < 0) return null
  const product = text(payload, 'product_name')

  const when = days === 0 ? 'היום' : 'מחר'
  const body = product
    ? `הקופון שלך ל${product} פג ${when}. שווה לנצל.`
    : `הקופון שלך פג ${when}. שווה לנצל.`
  return message('voucher_expiring', body)
}

/**
 * The parcel is moving.
 *
 * THE TRACKING NUMBER IS NOT HERE, for the same reason it is not in the push
 * body: a long LTR number inside an RTL sentence renders in a plausible but
 * wrong order, and a wrong tracking number is worse than none because the
 * customer will type it into a courier's site and be told it does not exist.
 * The carrier is named; the number is on the order page, isolated properly.
 */
function orderShipped(payload: Record<string, unknown>): SmsMessage | null {
  const carrier = text(payload, 'carrier')
  const body = carrier
    ? `ההזמנה שלך יצאה לדרך עם ${carrier}. פרטי המעקב באזור האישי.`
    : 'ההזמנה שלך יצאה לדרך. פרטי המעקב באזור האישי.'
  return message('order_shipped', body)
}

/**
 * The money came back.
 *
 * IT NAMES NO DATE. Cardcom credits the card; when the money appears is the
 * issuer's business and is routinely several business days later. A message
 * that names a day generates a support ticket on that day.
 */
function refundCompleted(payload: Record<string, unknown>): SmsMessage | null {
  const amount = integer(payload, 'refunded_agorot')
  if (amount === null || amount <= 0) return null
  return message('refund_completed', `הזיכוי בוצע: ${shekels(amount)} יוחזרו לכרטיס שלך.`)
}

/**
 * The one-time code for phone verification.
 *
 * THREE THINGS ARE DELIBERATE AND ALL THREE ARE SECURITY PROPERTIES:
 *
 * 1. IT IS NOT SUBJECT TO OPT-OUT. Every other message here is something we
 *    send TO a customer and they may refuse. An OTP is something the customer
 *    just asked for, seconds ago, by pressing a button. Suppressing it would
 *    lock somebody out of their own account because of a `STOP` they sent two
 *    years earlier. `isOptOutExempt` in `opt-out.ts` is where that lives.
 *
 * 2. IT WARNS AGAINST FORWARDING, in the message, because the entire attack on
 *    SMS OTP is a phone call saying "read me the code we just sent". The
 *    warning is the cheapest countermeasure there is and it costs one segment.
 *
 * 3. THE CODE IS ISOLATED AND NAMED FIRST. A code buried at the end of an RTL
 *    sentence is read wrong under pressure, and a customer typing a reversed
 *    code sees "wrong code" and assumes the system is broken.
 */
function otpCode(payload: Record<string, unknown>): SmsMessage | null {
  const code = text(payload, 'code')
  // Digits only, and a fixed length: anything else in an OTP body is either a
  // bug or an injection into a message the customer is primed to trust.
  if (!code || !/^\d{4,8}$/.test(code)) return null

  return message('otp', `קוד האימות שלך: ⁨${code}⁩\nאל תעבירו אותו לאף אחד.`)
}

/** Returns null for every kind that owes no SMS. Settled, not retried. */
export function buildSmsMessage(kind: string, payload: Record<string, unknown>): SmsMessage | null {
  switch (kind) {
    case 'voucher_issued':
      return voucherIssued(payload)
    case 'voucher_expiring':
      return voucherExpiring(payload)
    case 'order_shipped':
      return orderShipped(payload)
    case 'refund_completed':
      return refundCompleted(payload)
    case 'otp':
      return otpCode(payload)
    default:
      return null
  }
}

/** The kinds that can ever produce an SMS. Exported so tests can assert the set. */
export const SMS_KINDS: readonly SmsKind[] = [
  'voucher_issued',
  'voucher_expiring',
  'order_shipped',
  'refund_completed',
  'otp',
]

/**
 * The segment ceiling per kind.
 *
 * A budget, not a description. `templates.test.ts` asserts every rendered body
 * is at or under its number, so a template that grows past it fails a test
 * rather than quietly costing 50% more per send forever.
 */
export const SEGMENT_CEILING: Record<SmsKind, number> = {
  voucher_issued: 2,
  voucher_expiring: 2,
  order_shipped: 2,
  refund_completed: 2,
  // The forwarding warning is worth its segment.
  otp: 2,
}
