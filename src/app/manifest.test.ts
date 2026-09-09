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
 * The second is the handful of values the manifest and `public/sw.js` have to
 * agree on. The worker's own rules -- the bypass list, the caching strategies,
 * the push guards -- used to be asserted here as substrings and now live in
 * `src/__tests__/service-worker.test.ts`, which runs them. See the note above
 * the second describe block for what that change bought.
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

/**
 * THE SERVICE WORKER'S RULES MOVED, AND THIS IS WHY.
 *
 * They used to be asserted here as substrings of `public/sw.js`:
 * `expect(sw).toContain("request.method !== 'GET'")` and eight more like it.
 * That form has a failure mode this file just hit -- refactoring the eviction
 * into a shared `trimCache(cache, PAGES_LIMIT)` broke an assertion looking for
 * `keys.length - PAGES_LIMIT` while the worker's behaviour was unchanged. A
 * grep cannot tell whether the guard it matched is even reachable.
 *
 * `src/__tests__/service-worker.test.ts` now runs the file: it evaluates
 * `public/sw.js` against a fake ServiceWorkerGlobalScope and asserts what the
 * handler DOES with a request. Every rule that was checked here as text is
 * checked there as behaviour, plus the image cache, the eviction and the push
 * payload guards.
 *
 * One assertion stays in this file, below: that the manifest and the worker
 * agree about the offline document. Neither test file owns both.
 */
describe('the manifest and the worker agree', () => {
  it('precaches the offline page the fallback serves', () => {
    // Two constants in one file, and if they part company the fallback matches
    // nothing and a shopper with no signal gets the bare 503 instead.
    const offlineUrl = sw.match(/const OFFLINE_URL = '([^']+)'/)?.[1]
    expect(offlineUrl).toBe('/offline')
    expect(sw).toMatch(/const PRECACHE = \[[^\]]*OFFLINE_URL/)
  })

  it('precaches an icon the manifest actually declares', () => {
    // A PRECACHE entry for an icon that was renamed is a 404 on install. It
    // does not fail the install (they are added individually) and it does not
    // report anything either.
    const precache = sw.match(/const PRECACHE = \[([^\]]*)\]/)?.[1] ?? ''
    const icons = new Set(manifest().icons?.map((icon) => icon.src) ?? [])
    for (const match of precache.matchAll(/'(\/icons\/[^']+)'/g)) {
      expect(icons, `${match[1]} is precached and not in the manifest`).toContain(match[1])
    }
  })
})
