import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { contentSitemapEntries } from '@/lib/seo/sitemap-sections'
import { describe, expect, it } from 'vitest'

/**
 * EVERY PAGE WE ASK GOOGLE TO INDEX DECLARES WHICH URL IT IS.
 *
 * `content-pages.test.ts` already asserted this for `/about`, `/suppliers` and
 * `/blog` -- the three pages that were new when it was written. It is a list
 * somebody typed, so it says nothing about a page added afterwards, and two
 * pages had been added afterwards:
 *
 *   `/products`, the whole shop, submitted at priority 0.9, reachable at
 *   `?sort=` (six values), `?page=`, `?type=` (two values), `?min=` and
 *   `?max=`. `/category/[slug]` renders the SAME grid from the SAME parameters
 *   and has always carried a canonical, with a comment explaining why. The shop
 *   itself did not.
 *
 *   `/coupons`, also priority 0.9, which carried a title and nothing else.
 *
 * So this derives the list instead: it reads the paths out of the sitemap's own
 * content section and resolves each one to the file that serves it. A page
 * added to the sitemap is covered the day it is added, and a page that leaves
 * the sitemap stops being asked for a canonical without anybody editing a list.
 *
 * WHAT A MISSING CANONICAL COSTS. Not a penalty -- a split. Google picks one URL
 * per group of duplicates on its own, and without the declaration it may pick
 * `/products?sort=price_desc` as the one it shows, so the ranking earned by a
 * dozen near-identical URLs accrues to whichever one the crawler happened to
 * like.
 */

const APP = join(process.cwd(), 'src', 'app')

/** Every `page.tsx` / `page.mdx`, keyed by the route path it serves. */
function routeMap(): Map<string, string> {
  const map = new Map<string, string>()

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === 'page.tsx' || entry.name === 'page.mdx') {
        const segments = relative(APP, dir)
          .split('/')
          // Route groups are organisation, not URL. `(store)/faq` is `/faq`.
          .filter((segment) => segment !== '' && !segment.startsWith('('))
        map.set(`/${segments.join('/')}`, full)
      }
    }
  }

  walk(APP)
  return map
}

const ROUTES = routeMap()

/** The static paths the sitemap's content section publishes. */
const CONTENT_PATHS = contentSitemapEntries('https://example.test', undefined)
  .map((entry) => entry.url.slice('https://example.test'.length) || '/')
  .filter((path) => ROUTES.has(path))

describe('the route map found the app', () => {
  it('resolved the paths, so a passing run is not an empty one', () => {
    expect(ROUTES.size).toBeGreaterThan(20)
    expect(CONTENT_PATHS).toContain('/')
    expect(CONTENT_PATHS).toContain('/products')
    expect(CONTENT_PATHS).toContain('/coupons')
    expect(CONTENT_PATHS.length).toBeGreaterThanOrEqual(8)
  })
})

describe('every static page in the sitemap declares a canonical', () => {
  it.each(CONTENT_PATHS.map((path) => [path] as const))('%s', (path) => {
    const file = ROUTES.get(path)
    expect(file, `${path} is in the sitemap and has no page file`).toBeDefined()
    expect(readFileSync(file as string, 'utf8'), `${path} declares no canonical`).toContain(
      'canonical:',
    )
  })
})

describe('the dynamic routes in the sitemap declare one too', () => {
  // Listed rather than derived: a dynamic route has no single URL to read out
  // of the sitemap, and there are four of them.
  it.each([['/product/[slug]'], ['/category/[slug]'], ['/city/[slug]'], ['/s/[id]']])(
    '%s',
    (route) => {
      const file = ROUTES.get(route)
      expect(file, `${route} has no page file`).toBeDefined()
      expect(readFileSync(file as string, 'utf8')).toContain('canonical:')
    },
  )
})
