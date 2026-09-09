import { REGIONS } from '@/lib/regions'
import { describe, expect, it } from 'vitest'
import {
  SITEMAP_SECTIONS,
  categorySitemapEntries,
  contentSitemapEntries,
  productSitemapEntries,
  regionSitemapEntries,
  sectionPath,
  sitemapIndexXml,
  supplierSitemapEntries,
  urlsetXml,
} from './sitemap-sections'

const BASE = 'https://kenyonexpress.co.il'

describe('the index', () => {
  it('lists every section exactly once', () => {
    const xml = sitemapIndexXml(
      SITEMAP_SECTIONS.map((section) => ({ loc: `${BASE}${sectionPath(section)}` })),
    )
    for (const section of SITEMAP_SECTIONS) {
      expect(xml).toContain(`<loc>${BASE}/sitemap/${section}.xml</loc>`)
    }
    expect(xml.match(/<sitemap>/g)).toHaveLength(SITEMAP_SECTIONS.length)
  })

  it('is a sitemapindex and not a urlset', () => {
    const xml = sitemapIndexXml([{ loc: `${BASE}/sitemap/products.xml` }])
    expect(xml).toContain('<sitemapindex')
    expect(xml).not.toContain('<urlset')
  })
})

describe('the seventeen region pages, which no sitemap ever carried', () => {
  const entries = regionSitemapEntries(BASE)

  it('emits one per region', () => {
    // The gap this section exists for: `/city/<region>` is prerendered, carries
    // its own canonical and its own BreadcrumbList, is linked from the header
    // region menu, and was in no sitemap at all.
    expect(entries).toHaveLength(REGIONS.length)
    expect(entries).toHaveLength(17)
  })

  it('percent-encodes the Hebrew slug, matching the page own canonical', () => {
    const telAviv = entries.find((e) => e.url.includes('%d7') || e.url.includes('%D7'))
    expect(telAviv).toBeDefined()
    expect(entries.every((e) => e.url.startsWith(`${BASE}/city/`))).toBe(true)
  })

  it('carries no lastModified, because there is no signal for one', () => {
    // A region page renders a name from regions.ts and a city list from
    // geo/cities.ts. Both are source files: it changes when the code changes.
    expect(entries.every((e) => e.lastModified === undefined)).toBe(true)
  })
})

describe('catalogue entries', () => {
  it('percent-encodes a product slug, as the product page canonical does', () => {
    // Production holds slugs with Hebrew, with `₪` in them, and one that is a
    // bare import number. The page canonical is `encodeURIComponent(slug)`; the
    // old sitemap emitted the raw string, so the two named the same page with
    // two different bytes and one of them was not a legal URL.
    const [entry] = productSitemapEntries(BASE, [{ slug: 'צימר-מאסטר', updated_at: null }])
    expect(entry?.url).toBe(`${BASE}/product/${encodeURIComponent('צימר-מאסטר')}`)
  })

  it('drops a row with no slug rather than emitting /product/null', () => {
    expect(productSitemapEntries(BASE, [{ slug: null, updated_at: null }])).toEqual([])
    expect(categorySitemapEntries(BASE, [{ slug: null, updated_at: null }])).toEqual([])
  })

  it('omits lastModified when the row has no updated_at', () => {
    const [entry] = categorySitemapEntries(BASE, [{ slug: 'vacation', updated_at: null }])
    expect(entry?.lastModified).toBeUndefined()
  })

  it('carries the row updated_at when it has one', () => {
    const [entry] = supplierSitemapEntries(BASE, [
      { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d901', updated_at: '2026-09-01T10:00:00Z' },
    ])
    expect(entry?.lastModified?.toISOString()).toBe('2026-09-01T10:00:00.000Z')
  })
})

describe('content entries', () => {
  it('stamps the three catalogue-backed pages and leaves /contact alone', () => {
    const touched = new Date('2026-09-05T00:00:00Z')
    const entries = contentSitemapEntries(BASE, touched)
    const at = (path: string) => entries.find((e) => e.url === `${BASE}${path}`)

    expect(at('/')?.lastModified).toEqual(touched)
    expect(at('/products')?.lastModified).toEqual(touched)
    expect(at('/coupons')?.lastModified).toEqual(touched)
    // It changes when the code changes and there is no signal here for that.
    expect(at('/contact')?.lastModified).toBeUndefined()
  })

  it('survives an unknown catalogue date without inventing one', () => {
    const entries = contentSitemapEntries(BASE, undefined)
    expect(entries.find((e) => e.url === `${BASE}/`)?.lastModified).toBeUndefined()
  })
})

describe('a trailing slash on the base never doubles up', () => {
  it.each([['https://kenyonexpress.co.il/'], ['https://kenyonexpress.co.il//']])('%s', (base) => {
    expect(regionSitemapEntries(base)[0]?.url.startsWith('https://kenyonexpress.co.il/city/')).toBe(
      true,
    )
    expect(contentSitemapEntries(base, undefined)[0]?.url).toBe('https://kenyonexpress.co.il/')
  })
})

describe('XML escaping', () => {
  it('escapes an ampersand, which would otherwise break the whole file', () => {
    // Search Console rejects a sitemap that does not parse in its entirety; it
    // does not skip the offending line. One raw `&` in one catalogue slug costs
    // every URL in the file.
    const xml = urlsetXml([{ url: `${BASE}/product/a&b` }])
    expect(xml).toContain('<loc>https://kenyonexpress.co.il/product/a&amp;b</loc>')
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })

  it('escapes angle brackets so catalogue text cannot become markup', () => {
    const xml = urlsetXml([{ url: `${BASE}/product/<script>` }])
    expect(xml).not.toContain('<script>')
    expect(xml).toContain('&lt;script&gt;')
  })

  it('does not double-escape an already-escaped ampersand', () => {
    // `&` first in the replacement chain, or the escapes escape each other.
    const xml = urlsetXml([{ url: `${BASE}/a&b` }])
    expect(xml).not.toContain('&amp;amp;')
  })
})

describe('the urlset document', () => {
  it('declares the sitemap namespace', () => {
    expect(urlsetXml([])).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
  })

  it('writes lastmod as a W3C datetime', () => {
    const xml = urlsetXml([{ url: BASE, lastModified: new Date('2026-09-05T12:34:56Z') }])
    expect(xml).toContain('<lastmod>2026-09-05T12:34:56.000Z</lastmod>')
  })

  it('omits every optional element that was not given', () => {
    const xml = urlsetXml([{ url: BASE }])
    expect(xml).not.toContain('<lastmod>')
    expect(xml).not.toContain('<changefreq>')
    expect(xml).not.toContain('<priority>')
  })
})
