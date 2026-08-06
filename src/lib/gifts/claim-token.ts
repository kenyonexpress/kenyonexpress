import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The claim link's credential.
 *
 * A gift link is a bearer credential for something bought with a card: whoever
 * opens it takes ownership of the coupon. So it is treated like one.
 *
 * 32 random bytes from the CSPRNG, base64url, and only the SHA-256 is stored.
 * A plaintext column would mean that one read of `vouchers` - a table the
 * supplier portal, the admin and several reports touch - yields a working claim
 * link for every unclaimed gift in the system.
 *
 * Hashing here is deliberately NOT a password hash. The token is 256 bits of
 * CSPRNG output, so there is nothing to brute force and no value in a slow KDF;
 * what a slow hash would buy is a per-request cost on a lookup that has to be a
 * single indexed equality.
 */

const TOKEN_BYTES = 32

export interface GiftClaimToken {
  /** Goes in the email, and nowhere else. */
  token: string
  /** Goes in the database. */
  hash: string
}

export function createGiftClaimToken(): GiftClaimToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, hash: hashGiftClaimToken(token) }
}

export function hashGiftClaimToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Constant-time compare, for the one place that compares two hashes it already
 * holds. The database lookup is an indexed equality and is not constant time,
 * which is fine: it leaks nothing about a 256-bit random value that an attacker
 * cannot get by guessing anyway.
 */
export function giftTokenMatches(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, 'utf8')
  const b = Buffer.from(hashB, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Rejects anything that is not shaped like a token before it reaches the
 * database. A claim URL is user input, and `/gift/<1MB of junk>` should cost a
 * regex and not a query.
 */
export function isWellFormedGiftToken(value: string | null | undefined): boolean {
  const token = (value ?? '').trim()
  return token.length >= 40 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token)
}
