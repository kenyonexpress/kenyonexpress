import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pathRequiresAuth } from '../proxy'
import robots from './robots'

/**
 * THREE FILES THAT HAVE TO AGREE, AND NOTHING COMPARED THEM.
 *
 * `sitemap.ts` says "index this". `robots.ts` says "do not crawl that". The
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
 * WHAT THIS ASSERTS: every URL shape the sitemap emits is both crawlable and
 * reachable without a session. It reads the shapes out of `sitemap.ts` rather
 * than restating them, so a new entry is covered the day it is added, and it
 * reads the disallow list out of `robots()` rather than restating that either.
 */

const SITEMAP_SOURCE = readFileSync('src/app/sitemap.ts', 'utf8')

/** Every `${base}/...` path the sitemap builds, read out of the source. */
function sitemapPathShapes(): string[] {
  const found = new Set<string>()
  for (const match of SITEMAP_SOURCE.matchAll(/\$\{base\}(\/[a-z-]*)/g)) {
    const path = match[1] ?? ''
    found.add(path === '' ? '/' : path)
  }
  return [...found].sort()
}

/** A concrete path to probe for a shape that takes a dynamic segment. */
const SAMPLE: Record<string, string> = {
  '/product': '/product/some-slug',
  '/category': '/category/hot-deals',
  '/s': '/s/f47ac10b-58cc-4372-a567-0e02b2c3d901',
  '/blog': '/blog/some-post',
}

const disallowed: string[] = (() => {
  const rules = robots().rules
  const list = Array.isArray(rules) ? rules : [rules]
  return list.flatMap((rule) => {
    const d = rule.disallow
    return d === undefined ? [] : Array.isArray(d) ? d : [d]
  })
})()

describe('the sitemap only advertises URLs the site will actually serve', () => {
  const shapes = sitemapPathShapes()

  it('found the shapes, so a passing run is not an empty one', () => {
    expect(shapes.length).toBeGreaterThanOrEqual(8)
    expect(shapes).toContain('/suppliers')
  })

  it.each(sitemapPathShapes().map((shape) => [shape] as const))(
    '%s is reachable without a session',
    (shape) => {
      const path = SAMPLE[shape] ?? shape
      expect(pathRequiresAuth(path), `${path} is in sitemap.xml and redirects to login`).toBe(false)
    },
  )

  it.each(sitemapPathShapes().map((shape) => [shape] as const))(
    '%s is not disallowed by robots.txt',
    (shape) => {
      const path = SAMPLE[shape] ?? shape
      // A sitemap entry that robots forbids is a direct contradiction: it asks
      // a crawler to index a page it has just been told not to fetch.
      const blocked = disallowed.filter((rule) => rule !== '/' && path.startsWith(rule))
      expect(blocked, `${path} is in sitemap.xml and disallowed by ${blocked.join(', ')}`).toEqual(
        [],
      )
    },
  )
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
