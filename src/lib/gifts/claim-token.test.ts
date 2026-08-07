import { describe, expect, it } from 'vitest'
import {
  createGiftClaimToken,
  giftTokenMatches,
  hashGiftClaimToken,
  isWellFormedGiftToken,
} from './claim-token'

/**
 * A gift link is a bearer credential for something bought with a card, so the
 * properties asserted here are the ones that make it one: unguessable, stored
 * only as a hash, and rejected cheaply when it is not even shaped like a token.
 */
describe('createGiftClaimToken', () => {
  it('is unguessable and never repeats', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 500; i += 1) tokens.add(createGiftClaimToken().token)
    expect(tokens.size).toBe(500)
    // 32 bytes of CSPRNG, base64url: 43 characters, no padding.
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(43)
  })

  it('is URL safe, because it goes in a path segment', () => {
    for (let i = 0; i < 200; i += 1) {
      const { token } = createGiftClaimToken()
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(encodeURIComponent(token)).toBe(token)
    }
  })

  it('hands back the hash that goes in the database, not the token', () => {
    const { token, hash } = createGiftClaimToken()
    expect(hash).toBe(hashGiftClaimToken(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // The thing stored must not BE the credential: a read of `vouchers` should
    // not yield a working claim link for every unclaimed gift.
    expect(hash).not.toContain(token)
  })
})

describe('hashGiftClaimToken', () => {
  it('is stable, so a link mailed today still resolves tomorrow', () => {
    expect(hashGiftClaimToken('abc')).toBe(hashGiftClaimToken('abc'))
    expect(hashGiftClaimToken('abc')).not.toBe(hashGiftClaimToken('abd'))
  })
})

describe('giftTokenMatches', () => {
  it('compares equal hashes and rejects different ones', () => {
    const a = hashGiftClaimToken('one')
    expect(giftTokenMatches(a, hashGiftClaimToken('one'))).toBe(true)
    expect(giftTokenMatches(a, hashGiftClaimToken('two'))).toBe(false)
  })

  it('returns false instead of throwing on a length mismatch', () => {
    // timingSafeEqual throws on unequal lengths, which would turn a malformed
    // input into a 500 on the claim page.
    expect(giftTokenMatches(hashGiftClaimToken('one'), 'short')).toBe(false)
  })
})

describe('isWellFormedGiftToken', () => {
  it('accepts what the generator produces', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isWellFormedGiftToken(createGiftClaimToken().token)).toBe(true)
    }
  })

  it('rejects junk before it costs a query', () => {
    expect(isWellFormedGiftToken('')).toBe(false)
    expect(isWellFormedGiftToken(null)).toBe(false)
    expect(isWellFormedGiftToken('short')).toBe(false)
    expect(isWellFormedGiftToken('x'.repeat(2000))).toBe(false)
    // Anything that is not the alphabet cannot be a token this system minted.
    expect(isWellFormedGiftToken(`${'a'.repeat(42)}/`)).toBe(false)
    expect(isWellFormedGiftToken(`${'a'.repeat(42)}' or 1=1--`)).toBe(false)
  })
})
