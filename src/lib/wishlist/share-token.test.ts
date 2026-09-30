import { describe, expect, it } from 'vitest'
import {
  SHARE_TOKEN_MAX_LENGTH,
  SHARE_TOKEN_MIN_LENGTH,
  isShareToken,
  mintShareToken,
  sharedWishlistPath,
  sharedWishlistUrl,
} from './share-token'

describe('the wishlist share token', () => {
  it('mints 32 URL-safe characters that pass its own check', () => {
    for (let i = 0; i < 50; i++) {
      const token = mintShareToken()
      expect(token).toHaveLength(32)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(isShareToken(token)).toBe(true)
    }
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintShareToken()))
    expect(seen.size).toBe(200)
  })

  it('refuses anything the database CHECK or the URL would refuse', () => {
    expect(isShareToken('')).toBe(false)
    expect(isShareToken('a'.repeat(SHARE_TOKEN_MIN_LENGTH - 1))).toBe(false)
    expect(isShareToken('a'.repeat(SHARE_TOKEN_MIN_LENGTH))).toBe(true)
    expect(isShareToken('a'.repeat(SHARE_TOKEN_MAX_LENGTH))).toBe(true)
    expect(isShareToken('a'.repeat(SHARE_TOKEN_MAX_LENGTH + 1))).toBe(false)
    expect(isShareToken(`${'a'.repeat(31)}/`)).toBe(false)
    expect(isShareToken(`${'a'.repeat(31)}=`)).toBe(false)
    expect(isShareToken(`${'a'.repeat(31)} `)).toBe(false)
    expect(isShareToken(null)).toBe(false)
    expect(isShareToken(42)).toBe(false)
  })

  it('builds the path and the absolute URL without a double slash', () => {
    const token = 'x'.repeat(32)
    expect(sharedWishlistPath(token)).toBe(`/wishlist/shared/${token}`)
    expect(sharedWishlistUrl('https://kenyonexpress.co.il', token)).toBe(
      `https://kenyonexpress.co.il/wishlist/shared/${token}`,
    )
    expect(sharedWishlistUrl('https://kenyonexpress.co.il/', token)).toBe(
      `https://kenyonexpress.co.il/wishlist/shared/${token}`,
    )
  })
})
