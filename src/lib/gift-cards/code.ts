import { createHash, randomInt } from 'node:crypto'

/**
 * The gift card's bearer code.
 *
 * Unlike a gift claim link (32 CSPRNG bytes in a URL), a gift card code is
 * read out loud, printed on a greeting card and typed on a phone. So it is
 * short, grouped, and drawn from an alphabet without lookalikes: no 0/O, no
 * 1/I/L, no U (Crockford's exclusions). 16 characters of a 30-symbol alphabet
 * is ~78 bits - far beyond online guessing against a rate-limited endpoint,
 * and the table stores only the SHA-256 anyway, same rule as
 * `vouchers.gift_claim_token_hash`.
 *
 * Not a password hash, deliberately: the code is CSPRNG output, there is
 * nothing to brute force, and the lookup must stay a single indexed equality.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 16

export interface GiftCardCode {
  /** Grouped for humans: XXXX-XXXX-XXXX-XXXX. Goes in the email, and nowhere else. */
  code: string
  /** SHA-256 hex of the normalized code. Goes in the database. */
  hash: string
  /** The trailing group, for support conversations ("the card ending in..."). */
  last4: string
}

export function createGiftCardCode(): GiftCardCode {
  let raw = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // randomInt is rejection-sampled inside node, so no modulo bias.
    raw += ALPHABET[randomInt(ALPHABET.length)]
  }
  return { code: formatGiftCardCode(raw), hash: hashGiftCardCode(raw), last4: raw.slice(-4) }
}

/** Uppercases and strips separators, so a dictated or pasted code matches. */
export function normalizeGiftCardCode(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashGiftCardCode(code: string): string {
  return createHash('sha256').update(normalizeGiftCardCode(code), 'utf8').digest('hex')
}

/** XXXX-XXXX-XXXX-XXXX, the shape the email prints and the form placeholder shows. */
export function formatGiftCardCode(code: string): string {
  const raw = normalizeGiftCardCode(code)
  return raw.replace(/(.{4})(?=.)/g, '$1-')
}

/**
 * Shape gate before the database is asked. A wrong character can only be a
 * typo (the alphabet has no lookalikes to map), so the form can say so.
 */
export function isWellFormedGiftCardCode(value: string | null | undefined): boolean {
  const raw = normalizeGiftCardCode(value)
  if (raw.length !== CODE_LENGTH) return false
  for (const char of raw) {
    if (!ALPHABET.includes(char)) return false
  }
  return true
}
