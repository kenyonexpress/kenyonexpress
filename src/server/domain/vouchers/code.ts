import { randomBytes } from 'node:crypto'

/**
 * Voucher short code: 10 symbols of Crockford base32 without the ambiguous
 * I, L, O, U. 32^10 = 2^50 ~ 1.1e15 codes. Read aloud and typed by hand at a
 * counter, so it is displayed grouped but stored and compared without the
 * separator.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md section 3.
 */

export const VOUCHER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const VOUCHER_CODE_LENGTH = 10
const GROUP_SIZE = 5

/** Matches the DB CHECK vouchers_code_format exactly. */
export const VOUCHER_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

const ALPHABET_SIZE = VOUCHER_CODE_ALPHABET.length // 32
// Largest multiple of 32 that fits in a byte. Bytes at or above it are
// rejected so no symbol is favoured (a bare byte % 32 would bias 0-7).
const REJECTION_CEILING = 256 - (256 % ALPHABET_SIZE) // 256

export function isValidVoucherCode(code: string): boolean {
  return VOUCHER_CODE_PATTERN.test(code)
}

/**
 * Normalises user input for lookup: strips separators and whitespace and
 * upper-cases. Does not validate; call isValidVoucherCode after.
 */
export function normalizeVoucherCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** `XXXXX-XXXXX` for display and reading aloud. Never persisted. */
export function formatVoucherCode(code: string): string {
  const clean = normalizeVoucherCode(code)
  const groups: string[] = []
  for (let i = 0; i < clean.length; i += GROUP_SIZE) {
    groups.push(clean.slice(i, i + GROUP_SIZE))
  }
  return groups.join('-')
}

/**
 * One crypto-secure code. Rejection sampling over whole bytes, never
 * Math.random and never a modulo of a raw byte.
 */
export function generateVoucherCode(): string {
  let code = ''
  while (code.length < VOUCHER_CODE_LENGTH) {
    const buffer = randomBytes(VOUCHER_CODE_LENGTH)
    for (let i = 0; i < buffer.length && code.length < VOUCHER_CODE_LENGTH; i++) {
      const byte = buffer[i] as number
      if (byte >= REJECTION_CEILING) continue // unbiased: drop the tail
      code += VOUCHER_CODE_ALPHABET[byte % ALPHABET_SIZE]
    }
  }
  return code
}

export class VoucherCodeCollisionError extends Error {
  constructor(attempts: number) {
    super(`could not generate a unique voucher code after ${attempts} attempts`)
    this.name = 'VoucherCodeCollisionError'
  }
}

/**
 * Generates a code the caller's `exists` probe reports as free. The database
 * UNIQUE(code) is still the real arbiter; this only spares a wasted insert.
 * Throws rather than reusing or mutating a code, because a predictable code is
 * a free redemption at the counter.
 */
export async function generateUniqueVoucherCode(
  exists: (code: string) => Promise<boolean>,
  maxAttempts = 8,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateVoucherCode()
    if (!(await exists(code))) return code
  }
  throw new VoucherCodeCollisionError(maxAttempts)
}

/**
 * Effective TTL. offer_valid_until always wins over the rolling per-product
 * window, matching the DB CHECK vouchers_expires_within_offer.
 */
export function computeVoucherExpiry(params: {
  issuedAt: Date
  couponExpiryDays: number
  offerValidUntil: Date
}): Date {
  const rolling = new Date(
    params.issuedAt.getTime() + Math.max(1, params.couponExpiryDays) * 24 * 60 * 60 * 1000,
  )
  return rolling.getTime() <= params.offerValidUntil.getTime() ? rolling : params.offerValidUntil
}
