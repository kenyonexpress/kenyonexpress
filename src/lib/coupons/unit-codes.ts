// 8-digit numeric coupon codes for printed QR batches (migration 182).
//
// A unit code is 7 random digits plus a Luhn check digit. Numeric-only because
// the code is typed at a till or read over the phone, and digits survive both;
// the check digit exists so a mistyped code fails locally instead of costing a
// database round trip that can only miss. The keyspace is 10^7 valid codes,
// which is enumeration-resistant only together with the rate limit on the
// apply route, and is why the table is never client-readable (see 182).
//
// Pure module: no crypto import at module scope beyond globalThis.crypto, no
// database, no request. Everything here is testable with an injected RNG.

export const UNIT_CODE_LENGTH = 8

const UNIT_CODE_PATTERN = /^[0-9]{8}$/

/** Shape check only: exactly 8 ASCII digits. */
export function isUnitCodeShaped(code: string): boolean {
  return UNIT_CODE_PATTERN.test(code)
}

/**
 * The Luhn check digit for a run of digits.
 *
 * Standard Luhn: walking from the digit that will sit next to the check digit,
 * every second digit is doubled and 9 is subtracted from anything that
 * overflows. The check digit brings the total to a multiple of 10.
 */
export function luhnCheckDigit(body: string): number {
  let sum = 0
  let double = true
  for (let i = body.length - 1; i >= 0; i--) {
    let digit = body.charCodeAt(i) - 48
    if (digit < 0 || digit > 9) throw new Error('luhnCheckDigit: non-digit input')
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    double = !double
    sum += digit
  }
  return (10 - (sum % 10)) % 10
}

/** Shape plus check digit. This is the gate the cart uses before any lookup. */
export function isValidUnitCode(code: string): boolean {
  if (!isUnitCodeShaped(code)) return false
  return luhnCheckDigit(code.slice(0, 7)) === code.charCodeAt(7) - 48
}

/**
 * An unbiased random digit from webcrypto.
 *
 * Rejection sampling: a plain byte % 10 favours 0-5 (256 is not a multiple of
 * 10). Bytes of 250 and above are thrown away so every digit is exactly as
 * likely as every other, which is what keeps the keyspace claim honest.
 */
function cryptoRandomDigit(): number {
  const buf = new Uint8Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    const byte = buf[0] as number
    if (byte < 250) return byte % 10
  }
}

/** One fresh unit code: 7 random digits and their Luhn check digit. */
export function generateUnitCode(randomDigit: () => number = cryptoRandomDigit): string {
  let body = ''
  for (let i = 0; i < UNIT_CODE_LENGTH - 1; i++) body += String(randomDigit() % 10)
  return body + String(luhnCheckDigit(body))
}

/**
 * `count` distinct unit codes, none of which appear in `exclude`.
 *
 * The retry cap is generous on purpose: at the batch ceiling of 1000 codes
 * against a 10^7 keyspace, collisions are rare and the cap exists only so a
 * broken injected RNG (a test's constant function, say) throws instead of
 * spinning forever.
 */
export function generateUnitCodes(
  count: number,
  options: { exclude?: ReadonlySet<string>; randomDigit?: () => number } = {},
): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('generateUnitCodes: count must be a positive integer')
  }
  const exclude = options.exclude ?? new Set<string>()
  const out = new Set<string>()
  let attempts = 0
  const maxAttempts = count * 20
  while (out.size < count) {
    if (++attempts > maxAttempts) {
      throw new Error('generateUnitCodes: could not find enough free codes')
    }
    const code = generateUnitCode(options.randomDigit)
    if (exclude.has(code) || out.has(code)) continue
    out.add(code)
  }
  return [...out]
}

/**
 * The URL a printed coupon QR encodes: /c/<code> on the public origin.
 *
 * A URL and not the bare code for the same reason scan-input.ts spells out for
 * vouchers: a phone's built-in camera offers to open a URL, while a bare
 * number gets a web search. Trailing slashes are trimmed so a misconfigured
 * origin cannot produce /c//12345678.
 */
export function buildCouponApplyUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/c/${code}`
}
