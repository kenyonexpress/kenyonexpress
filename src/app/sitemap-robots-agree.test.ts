import {
  categorySitemapEntries,
  contentSitemapEntries,
  productSitemapEntries,
  regionSitemapEntries,
  supplierSitemapEntries,
} from '@/lib/seo/sitemap-sections'
import { describe, expect, it } from 'vitest'
import { pathRequiresAuth } from '../proxy'
import robots from './robots'

/**
 * THREE FILES THAT HAVE TO AGREE, AND NOTHING COMPARED THEM.
 *
 * The sitemap says "index this". `robots.ts` says "do not crawl that". The
 * proxy's auth gate says "log in first". A URL can satisfy any one of them and
 * contradict another, and until 2026-09-09 nothing looked at more than one at a
 * time.
 *
 * MEASURED ON THE LIVE SITE that day: `sitemap.xml` listed `/suppliers`, and
 * `/suppliers` answered **307 to /login?next=%2Fsuppliers**, because the auth
 * gate tested `pathname.startsWith('/supplier')` and that matches the plural.
 * `/suppliers` is the public "הצטרפו כספקים" recruitment page, linked from the
 * footer and allowed by robots.
 *
 * So the site submitted, to Google, a URL that redirects to a login form. Search
 * Console reports that as "Page with redirect" and does not index it. Nobody
 * using the site as a logged-in operator would ever see it.
 *
 * WHAT CHANGED HERE, 2026-09-09. This used to read `${base}/...` shapes out of
 * `app/sitemap.ts` WITH A REGULAR EXPRESSION, because that file was a
 * `use cache` default export a test could not call. That pattern matched an
 * ASCII character class, which is also why it could only ever have seen ASCII
 * paths: `/city/<hebrew>` would have matched as the empty shape `/city` even if
 * the old sitemap had emitted it, which it did not. The builders are pure now,
 * so this CALLS them with fixture rows and checks the URLs that actually come
 * out, Hebrew and percent-encoding included.
 */

const BASE = 'https://kenyonexpress.co.il'

/**
 * One representative row per catalogue type. Real shapes, including a Hebrew
 * product slug, because that is what production holds.
 */
const EMITTED: string[] = [
  ...contentSitemapEntries(BASE, undefined),
  ...categorySitemapEntries(BASE, [{ slug: 'hot-deals', updated_at: null }]),
  ...productSitemapEntries(BASE, [
    { slug: 'some-slug', updated_at: null },
    { slug: 'צימר-מאסטר', updated_at: null },
  ]),
  ...regionSitemapEntries(BASE),
  ...supplierSitemapEntries(BASE, [
    { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d901', updated_at: null },
  ]),
].map((entry) => entry.url.slice(BASE.length) || '/')

const disallowed: string[] = (() => {
  const rules = robots().rules
  const list = Array.isArray(rules) ? rules : [rules]
  return list.flatMap((rule) => {
    const d = rule.disallow
    return d === undefined ? [] : Array.isArray(d) ? d : [d]
  })
})()

describe('the sitemap only advertises URLs the site will actually serve', () => {
  it('found the URLs, so a passing run is not an empty one', () => {
    expect(EMITTED.length).toBeGreaterThanOrEqual(30)
    expect(EMITTED).toContain('/suppliers')
    // The seventeen region pages are in a sitemap for the first time.
    expect(EMITTED.filter((p) => p.startsWith('/city/'))).toHaveLength(17)
  })

  it.each(EMITTED.map((path) => [path] as const))('%s is reachable without a session', (path) => {
    expect(pathRequiresAuth(path), `${path} is in the sitemap and redirects to login`).toBe(false)
  })

  it.each(EMITTED.map((path) => [path] as const))('%s is not disallowed by robots.txt', (path) => {
    // A sitemap entry that robots forbids is a direct contradiction: it asks a
    // crawler to index a page it has just been told not to fetch.
    const blocked = disallowed.filter((rule) => rule !== '/' && path.startsWith(rule))
    expect(blocked, `${path} is in the sitemap and disallowed by ${blocked.join(', ')}`).toEqual([])
  })
})

describe('robots points at the index', () => {
  it('advertises /sitemap.xml and not the five files it lists', () => {
    // One line, because the index already enumerates the sections. A
    // `Sitemap:` per section is a second copy of the list, in a second file.
    expect(robots().sitemap).toBe(`${robots().host}/sitemap.xml`)
  })
})

describe('robots still disallows what it is there to disallow', () => {
  it('keeps the singular voucher paths out while leaving the plural listing in', () => {
    // /redeem/<token> IS a signed voucher token and /coupon/<id> is a
    // customer's own voucher with its code and QR on screen. /coupons is a
    // catalogue page. The distinction is one character in three places.
    expect(disallowed).toContain('/redeem/')
    expect(disallowed).toContain('/coupon/')
    expect(disallowed).not.toContain('/coupons')
  })

  it('keeps the private areas out', () => {
    for (const rule of ['/account/', '/admin/', '/api/', '/cart', '/checkout']) {
      expect(disallowed).toContain(rule)
    }
  })
})
