import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE CDN POLICY FOR `public/`, AND WHY IT IS NOT THE ONE `_next/static` GETS.
 *
 * Measured against production on 2026-09-10:
 *
 *   /_next/static/chunks/*.js   public,max-age=31536000,immutable   (Next itself)
 *   /images/logo.webp           public, max-age=0, must-revalidate
 *
 * Content-hashed output is handled by the framework. Files under `public/` are
 * not hashed, so they got the platform default and were revalidated by every
 * visitor on every navigation - a conditional request per image, per page view.
 *
 * `immutable` would be the wrong copy of the line above: a `public/` filename is
 * stable across deploys, so a long browser max-age pins whatever a visitor
 * already holds with no way to bust it, and the day the logo changes some
 * browsers keep the old one. `max-age=0` keeps the browser asking, `s-maxage`
 * lets the CDN answer for a day (a deploy purges it), and
 * `stale-while-revalidate` makes the week after that instant.
 *
 * VERIFIED AGAINST A REAL SERVER, not only in the config: `pnpm build` then
 * `PORT=3319 pnpm start` answered `/images/logo.webp` with the header below and
 * `/_next/static/...` unchanged. This test holds the config side, which is the
 * half that can regress in a diff.
 */

const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

describe('asset cache headers', () => {
  it('gives /images a CDN policy', () => {
    expect(config).toContain("source: '/images/:path*'")
    expect(config).toContain('public, max-age=0, s-maxage=86400, stale-while-revalidate=604800')
  })

  it('does not mark public/ assets immutable, because their names are stable', () => {
    // The failure this prevents is not a slow site, it is an unfixable one: a
    // stale logo in a browser cache with no filename to change.
    const imagesEntry = config.slice(config.indexOf("source: '/images/:path*'"))
    const entry = imagesEntry.slice(0, imagesEntry.indexOf('},'))
    expect(entry).not.toContain('immutable')
  })

  it('sets Cache-Control and nothing else there, so the CSP entries are untouched', () => {
    // The CSP entries above it rely on non-overlapping sources: two entries that
    // both matched one path would emit two Content-Security-Policy headers and
    // the browser would enforce the intersection, undoing the payment-frame
    // exception with nothing visible in the response. A different header key
    // cannot do that - but a second CSP key here could.
    const imagesEntry = config.slice(config.indexOf("source: '/images/:path*'"))
    const entry = imagesEntry.slice(0, imagesEntry.indexOf('},'))
    expect(entry).not.toMatch(/Content-Security-Policy/i)
    expect(entry.match(/key:/g) ?? []).toHaveLength(1)
  })
})
