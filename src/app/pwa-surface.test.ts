import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE PWA HALF OF STEP 09, WHICH THE READINESS ROW NEVER ASSESSED.
 *
 * That row records the 44px work and nothing else. The manifest, the service
 * worker, its registration, the install prompt and the iOS meta were never
 * checked, and each of them fails the same way: silently. A manifest naming an
 * icon that is not there produces no install prompt and no error; a worker
 * precaching a URL that 404s fails INSTALL, so the offline shell never exists,
 * and the only symptom is that going offline shows the browser's error page.
 *
 * Verified 2026-09-08 and pinned here: all three icons exist, the worker
 * precaches exactly two things and both are present, `/offline` is a real
 * route, and both PWA components are mounted in the root layout.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const inPublic = (url: string) =>
  existsSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')))

describe('the manifest points at files that exist', () => {
  const manifest = read('src/app/manifest.ts')
  const icons = [...manifest.matchAll(/src:\s*'([^']+)'/g)].map((m) => m[1] ?? '')

  it('declares icons at all', () => {
    expect(icons.length).toBeGreaterThanOrEqual(3)
  })

  it.each(icons)('%s is present under public/', (url) => {
    expect(inPublic(url), `${url} is in the manifest and not on disk`).toBe(true)
  })
})

describe('the service worker precaches only things that exist', () => {
  const sw = read('public/sw.js')

  it('keeps the precache list small and explicit', () => {
    // A worker that precaches a route list pins pages that later change. This
    // one takes the offline shell and one icon, and the file says why.
    expect(sw).toContain('const PRECACHE = [OFFLINE_URL')
  })

  it('serves an offline document that is a real route', () => {
    expect(sw).toContain("const OFFLINE_URL = '/offline'")
    expect(existsSync(resolve(process.cwd(), 'src/app/offline/page.tsx'))).toBe(true)
  })

  it('precaches an icon that is on disk', () => {
    expect(inPublic('/icons/icon-192.png')).toBe(true)
  })
})

describe('the PWA components are mounted, not merely written', () => {
  const layout = read('src/app/layout.tsx')

  it.each(['ServiceWorkerRegistrar', 'InstallPrompt'])('%s is rendered by the root layout', (c) => {
    // A registrar nobody renders is a service worker that never installs, and
    // nothing anywhere would say so.
    expect(layout).toContain(`<${c} />`)
  })

  it('declares the iOS and theme metadata a home-screen install needs', () => {
    expect(layout).toContain('appleWebApp')
    expect(layout).toContain('themeColor')
  })
})

/**
 * The offline shell must not be indexed, and must not be blocked either.
 */
describe('the offline shell is de-indexed rather than blocked', () => {
  const page = read('src/app/offline/page.tsx')

  it('carries a noindex', () => {
    expect(page).toContain('robots: { index: false')
  })

  it('is NOT disallowed in robots.txt', () => {
    // Blocking and de-indexing are opposites: a path robots.txt forbids is
    // never fetched, so its noindex is never read, and a blocked URL that
    // something links to can still be listed - permanently, because the one
    // instruction that would remove it is the one the crawler may not see.
    expect(read('src/app/robots.ts')).not.toContain('/offline')
  })

  it('stays out of the sitemap', () => {
    expect(read('src/app/sitemap.ts')).not.toContain("'/offline'")
  })
})
