import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { stripComments } from '@/lib/source-scan/strip-comments.mjs'
import { describe, expect, it } from 'vitest'

/**
 * `docs/CACHE-POLICY.md` MUST KEEP MATCHING THE CODE.
 *
 * The document is the answer to "what is stale and for how long", and it is
 * read at the moment somebody is deciding whether a price edit has propagated.
 * A cache document that has drifted is worse than none, because it is believed.
 *
 * WHY THIS COUNTS CODE AND NOT TEXT. The first draft of that table said sixteen
 * cached modules. Six of the sixteen were COMMENTS - `stock-live.ts`,
 * `StockScarcity.tsx`, `homepage/cms.ts` and the product page all DISCUSS
 * `'use cache'` at length while using none of it, because each explains why it
 * deliberately stays uncached. A plain grep counts those as caching. The real
 * number is ten, and the same mistake is available to anyone who checks this
 * the obvious way.
 */

const SRC = resolve(process.cwd(), 'src')

/** Comments removed, so a module that only writes ABOUT caching is not counted. */
const code = stripComments

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const measured = (() => {
  const cached: string[] = []
  const lives: Record<string, number> = {}
  const invalidators: Record<string, number> = {}
  let tags = 0
  for (const file of sourceFiles(SRC)) {
    const src = code(readFileSync(file, 'utf8'))
    if (/^\s*'use cache'/m.test(src)) cached.push(relative(SRC, file))
    for (const m of src.matchAll(/cacheLife\('(\w+)'\)/g)) {
      const name = m[1] ?? ''
      lives[name] = (lives[name] ?? 0) + 1
    }
    tags += [...src.matchAll(/cacheTag\(CATALOGUE_TAG\)/g)].length
    // THE WRITE SIDE, WHICH THIS TEST USED TO IGNORE.
    //
    // It counted cacheLife and cacheTag and nothing else, so the document could
    // drift about WHO INVALIDATES while every assertion here stayed green -
    // and it did. CACHE-POLICY.md said "four modules, all admin" and totalled
    // 13 calls; the real figure was 20 across seven modules, one of which is
    // not admin at all. Five of those calls were added in maintenance pass 62
    // and the list was not updated with them.
    const updates = [...src.matchAll(/updateTag\(CATALOGUE_TAG\)/g)].length
    if (updates > 0) invalidators[relative(SRC, file)] = updates
  }
  return { cached: cached.sort(), lives, tags, invalidators }
})()

const DOC = readFileSync(resolve(process.cwd(), 'docs/CACHE-POLICY.md'), 'utf8')

describe('the cache policy document matches the code', () => {
  it('names every cached module and no others', () => {
    expect(measured.cached).toEqual([
      'app/sitemap.ts',
      'components/CopyrightYear.tsx',
      'lib/category-page.ts',
      'lib/coupon-deals.ts',
      'lib/feeds/catalogue.ts',
      'lib/product-detail.ts',
      'lib/product-seo.ts',
      'lib/related-products.ts',
      'lib/supplier-storefront.ts',
      'server/queries/reviews.ts',
    ])
    for (const module of measured.cached) {
      expect(DOC, `${module} caches and the document does not list it`).toContain(module)
    }
  })

  it('agrees on the lifetime counts', () => {
    expect(measured.lives).toEqual({ hours: 19, days: 1 })
    expect(DOC).toContain("cacheLife('hours')        19")
    expect(DOC).toContain("cacheLife('days')          1")
  })

  it('agrees that there is exactly one invalidation tag, used 19 times', () => {
    expect(measured.tags).toBe(19)
    expect(DOC).toContain('cacheTag(CATALOGUE_TAG)   19')
  })

  it('still holds that no route declares its own caching', () => {
    // The claim section 1 opens with. If a page ever sets `revalidate` or
    // `dynamic`, the document's whole framing stops being true.
    const pages = sourceFiles(SRC).filter((f) => /\/page\.tsx$/.test(f))
    const declaring = pages.filter((f) => {
      const src = code(readFileSync(f, 'utf8'))
      return /export const (dynamic|revalidate)\s*=/.test(src) || /^\s*'use cache'/m.test(src)
    })
    expect(declaring.map((f) => relative(SRC, f))).toEqual([])
  })
})

/**
 * The one guarantee in the document that is about money rather than freshness.
 */
describe('a stale catalogue page cannot oversell', () => {
  it('reads stock live rather than from the cached product', () => {
    const stock = code(readFileSync(resolve(SRC, 'lib/commerce/stock-live.ts'), 'utf8'))
    expect(/^\s*'use cache'/m.test(stock)).toBe(false)
  })

  it('re-reads stock in the cart action', () => {
    const cart = code(readFileSync(resolve(SRC, 'server/actions/cart.ts'), 'utf8'))
    expect(/available_stock|readLiveStock|stock_quantity/.test(cart)).toBe(true)
  })
})

describe('the document matches the WRITE side too', () => {
  /**
   * Added 2026-09-08. Everything above measures reads. The document also claims
   * who invalidates, and that claim drifted unnoticed: it said "four modules,
   * all admin" and totalled 13 calls, while the code had 20 across seven
   * modules - one of them `supplier/profile.ts`, which is a business editing
   * its own details and not admin at all.
   *
   * The five supplier calls were added in maintenance pass 62, by the same work
   * that found supplier writes never invalidated. The list was not updated with
   * them, and nothing here looked.
   */
  it('lists every module that invalidates, and no others', () => {
    for (const module of Object.keys(measured.invalidators)) {
      expect(DOC, `${module} invalidates and the document does not list it`).toContain(module)
    }
  })

  it('agrees on the call count per module', () => {
    for (const [module, count] of Object.entries(measured.invalidators)) {
      const row = DOC.split('\n').find((line) => line.includes(module))
      expect(row, `${module} has no row`).toBeDefined()
      expect(row, `${module} is listed with the wrong count`).toMatch(new RegExp(`\\b${count}\\b`))
    }
  })

  it('does not still call the set admin-only', () => {
    // supplier/profile.ts is a supplier editing its own business details. A
    // reader who took "all admin" as a boundary would look in the wrong place.
    const hasNonAdmin = Object.keys(measured.invalidators).some(
      (module) => !module.includes('admin/'),
    )
    expect(hasNonAdmin).toBe(true)
    expect(DOC).not.toContain('Four modules, all admin')
  })
})
