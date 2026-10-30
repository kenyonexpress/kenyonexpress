import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 8-digit numeric voucher redemption codes with HMAC signing.
 *
 * Simpler alternative to the 10-character Crockford base32 codes for phone/SMS
 * entry. The full system has two parallel redemption paths:
 *   - QR scan → KEV1 payload with the 10-char code
 *   - Manual entry → 8-digit numeric code signed with VOUCHER_QR_SECRET
 *
 * 8 digits = 100,000,000 codes. Collision probability over N codes is
 * approximately N²/(2×10⁸), so 10,000 issued codes have ~0.05% collision risk.
 * The database UNIQUE constraint on signed_code catches collisions; this module
 * throws rather than retrying.
 */

export const REDEMPTION_CODE_LENGTH = 8
const CODE_MAX = 100_000_000 // 10^8

/** Matches 8 ASCII digits exactly */
export const REDEMPTION_CODE_PATTERN = /^[0-9]{8}$/

export function isValidRedemptionCode(code: string): boolean {
  return REDEMPTION_CODE_PATTERN.test(code)
}

/**
 * Strips non-digits and leading zeros for lookup.
 * Does not validate; call isValidRedemptionCode after.
 */
export function normalizeRedemptionCode(input: string): string {
  const digits = input.replace(/\D/g, '')
  return digits.padStart(REDEMPTION_CODE_LENGTH, '0').slice(-REDEMPTION_CODE_LENGTH)
}

/** `XXXX-XXXX` for display. Never persisted. */
export function formatRedemptionCode(code: string): string {
  const clean = normalizeRedemptionCode(code)
  return `${clean.slice(0, 4)}-${clean.slice(4)}`
}

/**
 * Generates one crypto-secure 8-digit code.
 * Returns zero-padded string, e.g., "00123456".
 */
export function generateRedemptionCode(): string {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  const num = buffer[0]! % CODE_MAX
  return num.toString().padStart(REDEMPTION_CODE_LENGTH, '0')
}

class VoucherCodeSecretMissingError extends Error {
  constructor() {
    super('VOUCHER_QR_SECRET is not set; refusing to sign or verify redemption codes')
    this.name = 'VoucherCodeSecretMissingError'
  }
}

function getSecret(): string {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret || secret.length < 16) throw new VoucherCodeSecretMissingError()
  return secret
}

/**
 * Signs an 8-digit code with HMAC-SHA256.
 * Returns base64url-encoded signature for storage.
 */
export function signRedemptionCode(code: string, voucherId: string): string {
  if (!isValidRedemptionCode(code)) {
    throw new Error(`Invalid redemption code format: ${code}`)
  }
  const secret = getSecret()
  const message = `${code}:${voucherId}`
  return createHmac('sha256', secret).update(message).digest('base64url')
}

/**
 * Verifies that a code matches its signature for a given voucher.
 * Constant-time comparison on equal-length buffers.
 */
export function verifyRedemptionCode(code: string, voucherId: string, signature: string): boolean {
  if (!isValidRedemptionCode(code)) return false

  try {
    const secret = getSecret()
    const message = `${code}:${voucherId}`
    const expected = Buffer.from(createHmac('sha256', secret).update(message).digest('base64url'))
    const provided = Buffer.from(signature)

    return expected.length === provided.length && timingSafeEqual(expected, provided)
  } catch (error) {
    if (error instanceof VoucherCodeSecretMissingError) throw error
    return false
  }
}

/**
 * Generates a signed redemption code for a voucher.
 * Returns both the code and its signature for database storage.
 *
 * The caller must check for uniqueness and handle collisions.
 * Collision probability is low but nonzero - see module comment.
 */
export function createSignedRedemptionCode(voucherId: string): {
  code: string
  signature: string
} {
  const code = generateRedemptionCode()
  const signature = signRedemptionCode(code, voucherId)
  return { code, signature }
}

class RedemptionCodeCollisionError extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique redemption code after ${attempts} attempts`)
    this.name = 'RedemptionCodeCollisionError'
  }
}

/**
 * Generates a code the caller's `exists` probe reports as free.
 * Throws on collision rather than retrying indefinitely.
 */
export async function generateUniqueRedemptionCode(
  voucherId: string,
  exists: (code: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<{ code: string; signature: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { code, signature } = createSignedRedemptionCode(voucherId)
    if (!(await exists(code))) return { code, signature }
  }
  throw new RedemptionCodeCollisionError(maxAttempts)
}
