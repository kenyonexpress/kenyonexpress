import { readFileSync } from 'node:fs'
import { SITE } from '@/styles/tokens'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'

/**
 * Goal 17. Two things are worth locking here, and neither is the manifest
 * being well-formed -- TypeScript already does that.
 *
 * The first is the icon/purpose split: declaring one tight icon as both `any`
 * and `maskable` is the single most common PWA mistake, and it looks fine
 * everywhere except on the Android launcher that clips it.
 *
 * The second, and the reason this file exists, is the service worker's bypass
 * list. A worker that caches a cart, a checkout or an account page is not a
 * performance regression, it is a shopper seeing a stale total or the previous
 * user's order on a shared device. That list is plain text in a file no
 * bundler checks, so it is asserted here.
 */

const sw = readFileSync('public/sw.js', 'utf8')

describe('web app manifest', () => {
  it('ships a dedicated maskable icon rather than reusing the tight one', () => {
    const m = manifest()
    const maskable = m.icons?.filter((i) => i.purpose === 'maskable') ?? []
    const any = m.icons?.filter((i) => i.purpose === 'any') ?? []

    expect(maskable).toHaveLength(1)
    expect(any.length).toBeGreaterThan(0)
    // Same asset for both purposes is the bug this guards.
    expect(maskable[0]?.src).not.toBe(any[0]?.src)
  })

  it('offers both launcher sizes', () => {
    const sizes = manifest().icons?.map((i) => i.sizes) ?? []

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('keeps colours on the tokens, so the splash screen cannot flash', () => {
    const m = manifest()

    expect(m.theme_color).toBe(SITE.brand.primary)
    expect(m.background_color).toBe(SITE.surface.page)
  })

  it('is Hebrew and right to left', () => {
    const m = manifest()

    expect(m.lang).toBe('he')
    expect(m.dir).toBe('rtl')
  })

  it('starts at a bare URL, so the cached document is the one that is served', () => {
    // A `?utm_source=pwa` here makes every launch a cache miss.
    expect(manifest().start_url).toBe('/')
  })

  it('is standalone, not fullscreen: a hidden status bar on checkout reads as phishing', () => {
    expect(manifest().display).toBe('standalone')
  })
})

describe('service worker safety rails', () => {
  it.each(['/api/', '/checkout', '/cart', '/account', '/supplier', '/admin', '/scan'])(
    'never handles %s',
    (path) => {
      // [\s\S] rather than the `s` flag: the tsconfig target predates it.
      const list = sw.match(/const BYPASS_PREFIXES = \[([\s\S]*?)\]/)?.[1] ?? ''
      expect(list).toContain(`'${path}'`)
    },
  )

  it('bypasses every non-GET request, so a POST can never be cached', () => {
    expect(sw).toContain("request.method !== 'GET'")
  })

  it('bypasses cross-origin requests', () => {
    expect(sw).toContain('url.origin !== self.location.origin')
  })

  it('serves navigations network-first, never cache-first', () => {
    // The whole document strategy in one assertion: fetch, and only fall back
    // to the cache in the catch.
    expect(sw).toMatch(/request\.mode === 'navigate'[\s\S]*?fetch\(request\)\.catch/)
  })

  it('deletes caches from previous versions on activate', () => {
    expect(sw).toContain('caches.delete')
    expect(sw).toContain('self.skipWaiting()')
    expect(sw).toContain('self.clients.claim()')
  })

  it('only stores clean same-origin responses', () => {
    expect(sw).toContain("response.ok && response.type === 'basic'")
  })
})
