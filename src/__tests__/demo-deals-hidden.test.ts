import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * C198: rows with `products.is_demo = true` (migrations 329/330) must not
 * reach any public listing, search, sitemap, feed or JSON-LD. RLS does not
 * know about `is_demo`, so every public read names it itself.
 *
 * The rule enforced here: in each public reader, every `from('products')`
 * that filters on `status = 'active'` also filters `is_demo = false` within
 * the same query chain. A new public query without it fails this test.
 * Admin readers are not listed on purpose: admin still sees demo rows.
 */
const PUBLIC_READERS = [
  'src/lib/home-data.ts',
  'src/lib/category-page.ts',
  'src/app/sitemap.ts',
  'src/lib/related-products.ts',
  'src/lib/city-page.ts',
  'src/lib/supplier-storefront.ts',
  'src/lib/feeds/catalogue.ts',
  'src/app/api/search/route.ts',
  'src/lib/search/faceted-server.ts',
  'src/lib/search-server.ts',
  'src/lib/search/meilisearch.ts',
  'src/app/api/mobile/products/[slug]/route.ts',
  'src/lib/product-detail.ts',
]

const WINDOW = 25

function activeProductReads(source: string): { line: number; chain: string }[] {
  const lines = source.split('\n')
  const reads: { line: number; chain: string }[] = []
  lines.forEach((text, i) => {
    if (!/from\(['"]products['"]\)/.test(text)) return
    const chain = lines.slice(i, i + WINDOW).join('\n')
    const statusAt = chain.indexOf(".eq('status', 'active')")
    if (statusAt < 0) return
    // The chain ends at the first blank line or statement end after the read.
    const end = chain.search(/\n\s*\n|\n\s*(const|let|if|return)\b/)
    if (end >= 0 && end < statusAt) return
    reads.push({ line: i + 1, chain: end >= 0 ? chain.slice(0, end) : chain })
  })
  return reads
}

describe('demo deals stay out of public reads (C198)', () => {
  for (const file of PUBLIC_READERS) {
    it(`${file}: every active products read excludes is_demo`, () => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      const reads = activeProductReads(source)
      expect(reads.length).toBeGreaterThan(0)
      const missing = reads
        .filter((read) => !read.chain.includes(".eq('is_demo', false)"))
        .map((read) => `${file}:${read.line}`)
      expect(missing).toEqual([])
    })
  }

  it('the PDP metadata read refuses a demo slug', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/product-seo.ts'), 'utf8')
    expect(source).toContain(".eq('is_demo', false)")
  })

  it('the search indexer deletes a demo row instead of indexing it', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/search/indexer.ts'), 'utf8')
    expect(source).toMatch(/row\.status !== 'active' \|\| row\.is_demo/)
  })

  it('both search_products RPC callers drop demo rows', () => {
    for (const file of ['src/lib/search-server.ts', 'src/app/api/search/route.ts']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).toContain('withoutDemoRows(')
    }
  })
})
