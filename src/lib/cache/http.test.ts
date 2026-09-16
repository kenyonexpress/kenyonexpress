import { describe, expect, it } from 'vitest'
import { CacheControl, cacheControlDirectives, isSharedCacheable, publicIsr } from './http'

describe('publicIsr', () => {
  it('emits the edge policy with a zero browser TTL', () => {
    expect(publicIsr(30, 60)).toBe('public, max-age=0, s-maxage=30, stale-while-revalidate=60')
  })

  it('refuses non-integer and negative windows', () => {
    // A float here would be serialised as `s-maxage=30.5`, which RFC 9111
    // says a cache MUST treat as absent -- the policy would silently become
    // "public, uncacheable at the edge".
    expect(() => publicIsr(30.5, 60)).toThrow(RangeError)
    expect(() => publicIsr(30, -1)).toThrow(RangeError)
  })
})

describe('CacheControl', () => {
  it('keeps every public policy at max-age=0 except the postal-code lookup', () => {
    for (const [name, value] of Object.entries(CacheControl)) {
      const d = cacheControlDirectives(value)
      if (d.public !== true) continue
      if (name === 'postalCode') {
        expect(d['max-age']).toBe('3600')
        continue
      }
      expect(d['max-age'], `${name} must not give the browser a TTL`).toBe('0')
    }
  })

  it('has s-maxage and stale-while-revalidate on every public policy', () => {
    for (const [name, value] of Object.entries(CacheControl)) {
      const d = cacheControlDirectives(value)
      if (d.public !== true) continue
      expect(typeof d['s-maxage'], `${name} s-maxage`).toBe('string')
      if (name !== 'postalCode') {
        expect(typeof d['stale-while-revalidate'], `${name} swr`).toBe('string')
      }
    }
  })

  it('private is neither shared-cacheable nor browser-storable', () => {
    const d = cacheControlDirectives(CacheControl.private)
    expect(d.private).toBe(true)
    expect(d['no-store']).toBe(true)
    expect(isSharedCacheable(CacheControl.private)).toBe(false)
  })

  it('search and feed are shared-cacheable', () => {
    expect(isSharedCacheable(CacheControl.search)).toBe(true)
    expect(isSharedCacheable(CacheControl.feed)).toBe(true)
    expect(isSharedCacheable(CacheControl.postalCode)).toBe(true)
  })
})

describe('cacheControlDirectives', () => {
  it('lower-cases, trims and tolerates trailing commas', () => {
    expect(cacheControlDirectives(' Public , S-MAXAGE=30 ,')).toEqual({
      public: true,
      's-maxage': '30',
    })
  })

  it('treats no-store as overriding public', () => {
    expect(isSharedCacheable('public, no-store')).toBe(false)
  })
})
