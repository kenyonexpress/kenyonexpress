import { describe, expect, it } from 'vitest'
import { mintWishlistShareToken, verifyWishlistShareToken, wishlistShareUrl } from './share'

const ENV = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-that-is-long-enough',
} as unknown as NodeJS.ProcessEnv
const NOW = new Date('2026-09-01T12:00:00Z')

describe('wishlist share token', () => {
  it('round-trips a sorted snapshot of product ids', () => {
    const token = mintWishlistShareToken(['b', 'a', 'a'], { now: NOW, env: ENV })
    const verdict = verifyWishlistShareToken(token, { now: NOW, env: ENV })
    expect(verdict).toMatchObject({ ok: true, productIds: ['a', 'b'] })
  })

  it('rejects a truncated or swapped signature', () => {
    const token = mintWishlistShareToken(['a'], { now: NOW, env: ENV })
    expect(verifyWishlistShareToken(token.slice(0, 10), { env: ENV }).ok).toBe(false)
    const parts = token.split('.')
    expect(verifyWishlistShareToken(`${parts[0]}.${parts[1]}.aaaa`, { env: ENV }).ok).toBe(false)
  })

  it('expires after the ttl', () => {
    const token = mintWishlistShareToken(['a'], { now: NOW, ttlDays: 1, env: ENV })
    const later = new Date(NOW.getTime() + 2 * 86_400_000)
    expect(verifyWishlistShareToken(token, { now: later, env: ENV })).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('builds a path under /wishlist/s/', () => {
    expect(wishlistShareUrl('https://kenyonexpress.co.il/', ['a'], { now: NOW, env: ENV })).toMatch(
      /^https:\/\/kenyonexpress\.co\.il\/wishlist\/s\/KWS1\./,
    )
  })
})
