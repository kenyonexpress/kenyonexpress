import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
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
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

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
  let tags = 0
  for (const file of sourceFiles(SRC)) {
    const src = code(readFileSync(file, 'utf8'))
    if (/^\s*'use cache'/m.test(src)) cached.push(relative(SRC, file))
    for (const m of src.matchAll(/cacheLife\('(\w+)'\)/g)) {
      const name = m[1] ?? ''
      lives[name] = (lives[name] ?? 0) + 1
    }
    tags += [...src.matchAll(/cacheTag\(CATALOGUE_TAG\)/g)].length
  }
  return { cached: cached.sort(), lives, tags }
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
