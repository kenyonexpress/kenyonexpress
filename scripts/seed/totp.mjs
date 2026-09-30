/**
 * RFC 6238 TOTP over RFC 4226 HOTP, SHA-1, 6 digits, 30-second steps: the
 * exact profile Supabase's native TOTP factor uses. Two callers, one file:
 * the seed script verifies the admin fixture's factor with it, and the
 * Playwright admin login answers the /admin-mfa challenge with it (STEP 19,
 * the whole admin tier is MFA-gated, and the E2E admin is deliberately the
 * weakest admin role). Node's crypto only, no dependency.
 */

import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Decodes an RFC 4648 base32 secret (case-insensitive, padding optional). */
export function base32Decode(secret) {
  const clean = String(secret).toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '')
  if (clean === '') throw new Error('totp: empty secret')
  const bytes = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`totp: invalid base32 character ${JSON.stringify(char)}`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** HOTP(K, C): the 6-digit (by default) code for one counter value. */
export function hotpCode(secret, counter, digits = 6) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** TOTP(K, T): the code for a moment in time (ms since the epoch). */
export function totpCode(secret, nowMs = Date.now(), { stepSeconds = 30, digits = 6 } = {}) {
  const counter = Math.floor(nowMs / 1000 / stepSeconds)
  return hotpCode(secret, counter, digits)
}

/** Milliseconds left in the current step: a code minted with less than a
 * couple of seconds to live is better re-minted after the boundary. */
export function msUntilNextStep(nowMs = Date.now(), stepSeconds = 30) {
  const stepMs = stepSeconds * 1000
  return stepMs - (nowMs % stepMs)
}
