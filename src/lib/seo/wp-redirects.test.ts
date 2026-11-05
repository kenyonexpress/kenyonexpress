import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizePath } from './normalize-path'
import { sourceSpellings, toNextRedirects } from './wp-redirects'
import { WP_REDIRECTS } from './wp-redirects.generated'

/**
 * S31. The gate on the WordPress redirects next.config.ts serves.
 *
 * No network and no server: this checks the generated list against the two
 * artefacts it was derived from, and checks the shape Next is handed. Whether
 * a request actually gets a 301 is measured by scripts/test-wp-redirects.mjs
 * against a running build.
 */

const ROOT = resolve(__dirname, '../../..')
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T

type SlugEntry = {
  type: 'product' | 'category' | 'page'
  wp_id: number | null
  old_slug: string
  old_path: string
  old_path_as_crawled: string
  new_path: string | null
  disposition: 'redirect_301' | 'gone_410' | 'unchanged' | 'lost_404'
}

const slugMap = readJson<{
  $counts: { permalinks: number; post: { total: number } }
  entries: SlugEntry[]
}>('data/legacy/wp-slug-map.json')

const measured = readJson<{
  $targets: {
    products: string[]
    categories: { slug: string }[]
    static_routes: string[]
  }
  redirects: { source: string; target: string; status: 301 | 410 }[]
}>('data/legacy/redirect-map.json')

const routes = new Set(measured.$targets.static_routes)
const products = new Set(measured.$targets.products)
const categories = new Set(measured.$targets.categories.map((c) => c.slug))

function servedBy(path: string): string | null {
  if (routes.has(path)) return 'static route'
  if (path.startsWith('/product/') && products.has(path.slice('/product/'.length))) return 'product'
  if (path.startsWith('/category/') && categories.has(path.slice('/category/'.length))) {
    return 'category'
  }
  return null
}

describe('the slug map covers the crawl', () => {
  it('holds every inventory URL exactly once', () => {
    const inventory = readJson<{ rows: { old_path: string }[] }>('data/legacy/url-inventory.json')
    const mapped = slugMap.entries.map((e) => e.old_path)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect([...mapped].sort()).toEqual(inventory.rows.map((r) => normalizePath(r.old_path)).sort())
    expect(slugMap.$counts.permalinks).toBe(inventory.rows.length)
  })

  it('holds every product and category permalink, with its WordPress id and slug', () => {
    const wpProducts = readJson<{
      rows: { wp_post_id: number; slug_decoded: string; permalink: string }[]
    }>('data/legacy/products.json')
    const wpCategories = readJson<{
      rows: { wp_term_id: number; slug_decoded: string; permalink: string }[]
    }>('data/legacy/categories.json')
    const byPath = new Map(slugMap.entries.map((e) => [e.old_path, e]))

    for (const p of wpProducts.rows) {
      const entry = byPath.get(normalizePath(p.permalink))
      expect(entry, p.permalink).toBeDefined()
      expect(entry?.type).toBe('product')
      expect(entry?.wp_id).toBe(p.wp_post_id)
      expect(entry?.old_slug).toBe(p.slug_decoded)
    }
    for (const c of wpCategories.rows) {
      const entry = byPath.get(normalizePath(c.permalink))
      expect(entry, c.permalink).toBeDefined()
      expect(entry?.type).toBe('category')
      expect(entry?.wp_id).toBe(c.wp_term_id)
      expect(entry?.old_slug).toBe(c.slug_decoded)
    }
  })

  it('gives a destination to exactly the entries that have one', () => {
    for (const e of slugMap.entries) {
      if (e.disposition === 'redirect_301') expect(e.new_path, e.old_path).not.toBe(e.old_path)
      if (e.disposition === 'unchanged') expect(e.new_path).toBe(e.old_path)
      if (e.disposition === 'gone_410' || e.disposition === 'lost_404') {
        expect(e.new_path, e.old_path).toBeNull()
      }
    }
  })

  it('records that the export has no blog posts, instead of silently mapping none', () => {
    expect(slugMap.$counts.post.total).toBe(0)
    expect(slugMap.entries.some((e) => (e.type as string) === 'post')).toBe(false)
  })
})

describe('the generated list is the measured map, and nothing else', () => {
  it('equals the 301 rows of redirect-map.json, plus the one row an alias rescues', () => {
    // One author for liveness. If these two disagree, the config and the
    // table send the same old URL to different places.
    //
    // The single addition is `/coupon-scanner`. The crawl maps it to `/scan`,
    // which is an alias in next.config.ts and not a page, so the measured map
    // drops it as `target_not_live`. The generator follows the alias to
    // `/supplier/scan` and still requires THAT to be a measured static route
    // (asserted by 'only redirects to a path this site serves' below). Named
    // here in full so a second such row cannot arrive unnoticed.
    const expected = [
      ...measured.redirects.filter((r) => r.status === 301).map((r) => [r.source, r.target]),
      ['/coupon-scanner', '/supplier/scan'],
    ].sort()
    expect(WP_REDIRECTS.map((r) => [r.source, r.destination]).sort()).toEqual(expected)
  })

  it('follows the alias next.config.ts actually declares', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    expect(config).toContain("{ source: '/scan', destination: '/supplier/scan', permanent: true }")
    expect(routes.has('/supplier/scan')).toBe(true)
    expect(routes.has('/scan')).toBe(false)
  })

  it('equals the redirect_301 entries of the slug map', () => {
    const expected = slugMap.entries
      .filter((e) => e.disposition === 'redirect_301')
      .map((e) => [e.old_path, e.new_path])
      .sort()
    expect(WP_REDIRECTS.map((r) => [r.source, r.destination]).sort()).toEqual(expected)
  })

  it('never redirects a path this site serves', () => {
    // `redirects()` runs before file routing. A row whose source is live takes
    // the page down, with a status code that tells Google it moved for good.
    for (const r of WP_REDIRECTS) expect(servedBy(r.source), r.source).toBeNull()
  })

  it('only redirects to a path this site serves', () => {
    for (const r of WP_REDIRECTS) expect(servedBy(r.destination), r.destination).not.toBeNull()
  })

  it('has no chains', () => {
    const sources = new Set(WP_REDIRECTS.map((r) => r.source))
    for (const r of WP_REDIRECTS) expect(sources.has(r.destination), r.destination).toBe(false)
  })
})

describe('what next.config.ts is handed', () => {
  const rows = toNextRedirects()

  it('is 301, never the 308 that `permanent` means in Next', () => {
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.statusCode).toBe(301)
      expect(row).not.toHaveProperty('permanent')
    }
  })

  it('has no duplicate source', () => {
    const sources = rows.map((r) => r.source)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('spells an ASCII source once and a Hebrew one three ways', () => {
    expect(sourceSpellings('/shop')).toEqual(['/shop'])
    expect(sourceSpellings('/product-category/עד-99')).toEqual([
      '/product-category/%D7%A2%D7%93-99',
      '/product-category/%d7%a2%d7%93-99',
      '/product-category/עד-99',
    ])
    for (const r of WP_REDIRECTS) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range is the point
      const ascii = /^[\x00-\x7F]*$/.test(r.source)
      const spelled = rows.filter((row) => normalizePath(row.source) === r.source)
      expect(spelled.length, r.source).toBe(ascii ? 1 : 3)
    }
  })

  it('carries the WordPress lower-case hex spelling of every crawled URL', () => {
    // The exact string in Google's index and in old links.
    const sources = new Set(rows.map((r) => r.source))
    for (const e of slugMap.entries.filter((e) => e.disposition === 'redirect_301')) {
      expect(sources.has(e.old_path_as_crawled), e.old_path_as_crawled).toBe(true)
    }
  })

  it('writes an ASCII destination', () => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range is the point
    for (const row of rows) expect(row.destination).toMatch(/^[\x00-\x7F]+$/)
  })

  it('contains nothing the route compiler would read as syntax', () => {
    // Sources and destinations go through path-to-regexp. A `:` or a `(` in a
    // slug would be parsed as a parameter or a group, and the row would match
    // something other than the URL it was written for.
    for (const row of rows) {
      expect(row.source).not.toMatch(/[:*()?+{}[\]\\]/)
      expect(row.destination).not.toMatch(/[:*()?+{}[\]\\]/)
    }
  })

  it('does not collide with the hand-written redirects in next.config.ts', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    const handWritten = [
      ...config.matchAll(/\{ source: '([^']+)', destination: '[^']+', permanent/g),
    ]
      .map((m) => m[1])
      .filter((s): s is string => typeof s === 'string')
    expect(handWritten.length).toBeGreaterThan(0)
    const generated = new Set(rows.map((r) => normalizePath(r.source)))
    for (const source of handWritten)
      expect(generated.has(normalizePath(source)), source).toBe(false)
    // And the list is actually wired in.
    expect(config).toContain('...toNextRedirects()')
  })
})
