import { describe, expect, it } from 'vitest'
import {
  CDN_IMAGE_MAX_AGE_SECONDS,
  IMMUTABLE_CACHE_CONTROL,
  MUTABLE_CACHE_CONTROL,
  cacheControlForKey,
  cacheControlForObjectKey,
  cacheTagHeaderForKey,
  cacheTagsForKey,
  isContentAddressedKey,
} from './cache-policy.mjs'

describe('cache policy per key', () => {
  it('is 30 days exactly', () => {
    expect(CDN_IMAGE_MAX_AGE_SECONDS).toBe(2592000)
    expect(MUTABLE_CACHE_CONTROL).toBe(
      'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
    )
  })

  it('content-addressed keys are immutable for a year; named keys are 30 days', () => {
    expect(isContentAddressedKey('wp/ab/abcdef.card.webp')).toBe(true)
    expect(isContentAddressedKey('products/b7.avif')).toBe(false)
    expect(cacheControlForKey('wp/ab/abcdef.card.webp')).toBe(IMMUTABLE_CACHE_CONTROL)
    expect(cacheControlForKey('products/b7.avif')).toBe(MUTABLE_CACHE_CONTROL)
    expect(cacheControlForKey('live-assets/wp-content/uploads/x.jpg')).toBe(MUTABLE_CACHE_CONTROL)
    expect(cacheControlForObjectKey).toBe(cacheControlForKey)
  })

  it('tags: site, prefix, key; the key percent-encoded so a comma cannot split it', () => {
    expect(cacheTagsForKey('products/a,b.webp')).toEqual([
      'images',
      'images:products',
      'image:products%2Fa%2Cb.webp',
    ])
    expect(cacheTagHeaderForKey('wp/ab/c.webp')).toBe('images,images:wp,image:wp%2Fab%2Fc.webp')
  })

  it('drops the key tag, never the site tag, when the encoded key exceeds 256 bytes', () => {
    const long = `products/${'א'.repeat(120)}.webp`
    const tags = cacheTagsForKey(long)
    expect(tags).toEqual(['images', 'images:products'])
  })
})
