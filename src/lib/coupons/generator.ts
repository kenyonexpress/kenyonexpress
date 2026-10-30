import { randomInt } from 'node:crypto'

/**
 * Coupon code generator.
 *
 * A coupon code is 8 numeric digits: 7 random digits followed by one check
 * digit computed with the Damm algorithm. Damm detects every single-digit
 * error and every adjacent transposition, so a mistyped or misread code fails
 * validation instead of colliding with a different valid code. Codes are
 * strings, never numbers — leading zeros are significant.
 *
 * The QR payload wraps the code in a versioned prefix, `KEC1.<code>`, in the
 * same style as the `KEV1.` voucher tokens, so a scanner can tell a coupon
 * from a voucher before hitting the server.
 */

export const COUPON_CODE_LENGTH = 8
export const COUPON_QR_PREFIX = 'KEC1.'

const COUPON_CODE_PATTERN = /^\d{8}$/

/**
 * Damm operation table (order-10 totally anti-symmetric quasigroup).
 * The zero diagonal is what makes the interim digit itself the check digit.
 */
const DAMM_TABLE = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
] as const

function dammInterim(digits: string): number {
  let interim = 0
  for (const ch of digits) {
    const row = DAMM_TABLE[interim]
    if (!row) throw new Error(`coupon checksum: interim ${interim} out of range`)
    const next = row[ch.charCodeAt(0) - 48]
    if (next === undefined) throw new Error(`coupon checksum: non-digit character "${ch}"`)
    interim = next
  }
  return interim
}

/** The Damm check digit for a run of digits. Appending it makes the interim 0. */
export function couponCheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new Error('coupon check digit needs a non-empty digit string')
  return dammInterim(digits)
}

/** True for exactly 8 digits whose Damm interim over all 8 is 0. */
export function isValidCouponCode(code: string): boolean {
  return COUPON_CODE_PATTERN.test(code) && dammInterim(code) === 0
}

/**
 * A fresh 8-digit coupon code: 7 digits from crypto randomness plus the Damm
 * check digit. `random` is injectable for deterministic tests and must return
 * an integer in [0, max).
 */
export function generateCouponCode(random: (max: number) => number = randomInt): string {
  let body = ''
  for (let i = 0; i < COUPON_CODE_LENGTH - 1; i++) {
    const digit = random(10)
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
      throw new Error(
        `coupon generator: random() returned ${digit}, expected an integer in [0, 10)`,
      )
    }
    body += String(digit)
  }
  return body + String(couponCheckDigit(body))
}

/** The string a coupon QR encodes: the versioned prefix plus the code. */
export function buildCouponQrPayload(code: string): string {
  if (!isValidCouponCode(code)) {
    throw new Error('coupon QR payload refused: code is not a valid 8-digit coupon code')
  }
  return COUPON_QR_PREFIX + code
}

/** The code carried by a QR payload, or null when the payload is not a valid coupon. */
export function parseCouponQrPayload(payload: string): string | null {
  const trimmed = (payload ?? '').trim()
  if (!trimmed.startsWith(COUPON_QR_PREFIX)) return null
  const code = trimmed.slice(COUPON_QR_PREFIX.length)
  return isValidCouponCode(code) ? code : null
}

/** Convenience: one call producing both the code and its QR payload. */
export function generateCoupon(random: (max: number) => number = randomInt): {
  code: string
  qrPayload: string
} {
  const code = generateCouponCode(random)
  return { code, qrPayload: buildCouponQrPayload(code) }
}
