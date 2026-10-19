import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY PUBLIC ROUTE DECLARES ITS OWN TITLE.
 *
 * STEP 15 asks for "Hebrew titles/descriptions per route". A page that declares
 * none does not fail - it silently inherits the root layout's, so a new public
 * page ships with the site's default title, and the only way to notice is to
 * look at a search result weeks later.
 *
 * Measured 2026-09-08: 39 public page routes, all 39 declaring metadata. A first
 * pass counted 16 pages with none and that was a false alarm of the scan, worth
 * recording because it is the same shape twice:
 *
 *   - five are `(legal)/legal/*` REDIRECT STUBS. `/legal/terms` 308s to
 *     `/terms-and-conditions`; two indexable sets of terms was a real defect
 *     once and `legal-routes.test.ts` exists because of it. A redirect needs no
 *     title.
 *   - nine are under `/admin/`, `/account/`, `/supplier/` or `/scan`, every one
 *     of which robots.txt disallows.
 *   - two are `/debug/sentry*`, which robots.txt does NOT disallow. They call
 *     `notFound()` unless `debugErrorRoutesEnabled()`, so a crawler gets a 404
 *     and there is nothing to title. Listing them in robots.txt would be worse
 *     than leaving them out: that file is public, so a disallow line would
 *     ADVERTISE that debug routes exist.
 *
 * The exclusions are derived rather than hand-listed - from `robots.ts`, and
 * from the gate a page actually calls. A first draft of this file hand-excluded
 * `/debug/`, which is how a scanner ends up agreeing with whoever wrote it.
 */

const APP = resolve(process.cwd(), 'src/app')
const ROBOTS = readFileSync(join(APP, 'robots.ts'), 'utf8')

/** The disallow list, read from robots.ts so the two cannot drift apart. */
const DISALLOWED = [
  ...ROBOTS.slice(
    ROBOTS.indexOf('disallow: ['),
    ROBOTS.indexOf(']', ROBOTS.indexOf('disallow: [')),
  ).matchAll(/'(\/[a-z-]*\/?)'/g),
].map((m) => m[1] ?? '')

/** Route-group segments are invisible in the URL. */
function routeOf(dir: string): string {
  const rel = relative(APP, dir).replace(/\([^)]+\)\//g, '')
  return `/${rel}`.replace(/\/page\.tsx$/, '')
}

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) pageFiles(full, out)
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')

const publicPages = pageFiles(APP)
  .map((file) => ({ file, route: routeOf(file), src: code(readFileSync(file, 'utf8')) }))
  // Crawlers are told not to fetch these, so a title is cosmetic.
  .filter(
    ({ route }) => !DISALLOWED.some((d) => route === d.replace(/\/$/, '') || route.startsWith(d)),
  )
  // A redirect answers 308 and renders nothing; metadata would never be read.
  .filter(({ src }) => !/permanentRedirect\(|\bredirect\(/.test(src) || src.length > 1200)
  // A page that 404s unless a debug flag is on has no crawlable form either.
  .filter(({ src }) => !/debugErrorRoutesEnabled\(\)/.test(src))

describe('the disallow list is read, not guessed', () => {
  it('found the prefixes robots.ts actually publishes', () => {
    expect(DISALLOWED).toContain('/admin/')
    expect(DISALLOWED).toContain('/account/')
    expect(DISALLOWED).toContain('/supplier/')
    expect(DISALLOWED.length).toBeGreaterThanOrEqual(10)
  })
})

describe('every crawlable page declares its own metadata', () => {
  it('scanned a real number of routes', () => {
    // A guard that filters everything out reports perfection. This is the
    // failure mode that has caught out three scanners in this repo already.
    expect(publicPages.length).toBeGreaterThanOrEqual(25)
  })

  it('leaves none inheriting the root title by accident', () => {
    const missing = publicPages
      .filter(
        ({ src }) => !/export const metadata|export (async )?function generateMetadata/.test(src),
      )
      .map(({ route }) => route)
    expect(
      missing,
      `these are crawlable and declare no metadata, so they ship the site default:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })
})
