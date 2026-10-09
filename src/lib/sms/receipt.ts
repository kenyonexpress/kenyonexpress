/**
 * Turning a Twilio status callback into the columns `sms_messages` holds.
 *
 * Pure, and separate from the route, so the two conversions that are easy to
 * get wrong can be tested without a webhook.
 */

/** Twilio's `MessageStatus`, narrowed to what the table's CHECK accepts. */
export type SmsStatus = 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed'

/**
 * Twilio's vocabulary is wider than the table's and most of it is noise.
 *
 * `accepted`, `scheduled`, `queued` and `sending` are all "on its way" and
 * collapse to `queued`; `sent` means it reached the carrier, which is NOT
 * delivery and is kept distinct for exactly that reason. `read` is a WhatsApp
 * status that cannot occur on an SMS, and `canceled` is a scheduled message
 * that never went, which is `failed` from a log's point of view.
 *
 * An unrecognised status returns null and the caller leaves the row alone.
 * Writing a status the CHECK constraint refuses would turn one unknown value
 * into a 23514 that loses the whole receipt, including the price.
 */
export function toSmsStatus(raw: string | null | undefined): SmsStatus | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'accepted':
    case 'scheduled':
    case 'queued':
    case 'sending':
      return 'queued'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'undelivered':
      return 'undelivered'
    case 'failed':
    case 'canceled':
    case 'cancelled':
      return 'failed'
    default:
      return null
  }
}

/**
 * Twilio's price string to exact integer millionths.
 *
 * THREE THINGS ABOUT THIS STRING TRIP PEOPLE UP:
 *
 *   IT IS NEGATIVE. "-0.00750" means "debited from your balance". Stored as-is
 *   in a cost column it makes every future SUM() read as a credit, so the sign
 *   is flipped here and the column CHECKs non-negative to catch a caller that
 *   forgets.
 *
 *   IT HAS FIVE DECIMAL PLACES. Rounding it to agorot turns $0.0075 into 1
 *   agora, a 30% error on the unit price, multiplied by every message ever
 *   sent. Millionths hold it exactly.
 *
 *   IT IS ABSENT UNTIL THE RECEIPT. The POST response carries `price: null`;
 *   only the delivery callback has a number. Null in, null out -- a zero would
 *   claim the message was free.
 *
 * Parsed by DIGITS rather than by multiplying a float: `0.00750 * 1e6` is
 * 7499.999999999999 in binary floating point, and `Math.round` would rescue
 * this particular case while quietly failing another. No float touches it.
 */
export function priceToMicro(price: string | null | undefined): number | null {
  if (price === null || price === undefined) return null
  const trimmed = String(price).trim()
  if (trimmed === '') return null

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(trimmed)
  if (!match) return null

  const whole = match[2] ?? ''
  const fraction = match[3] ?? ''
  if (whole === '' && fraction === '') return null
  // More than six decimal places is more precision than a millionth can hold.
  // Refusing beats silently truncating a number somebody will later add up.
  if (fraction.length > 6) return null

  const units = whole === '' ? 0 : Number(whole)
  const micros = fraction === '' ? 0 : Number(fraction.padEnd(6, '0'))
  if (!Number.isSafeInteger(units) || !Number.isSafeInteger(micros)) return null

  // The sign is dropped, not preserved: this is a cost, and Twilio's minus sign
  // is a statement about their ledger rather than about ours.
  return units * 1_000_000 + micros
}

/** A three-letter currency, or null. Anything else would fail the CHECK. */
export function toCurrencyCode(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(value) ? value : null
}

/** Twilio's `ErrorCode`, as the integer the column holds. */
export function toErrorCode(raw: string | null | undefined): number | null {
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
