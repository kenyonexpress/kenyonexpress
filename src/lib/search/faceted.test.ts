import { describe, expect, it } from 'vitest'
import {
  applyFacetFilters,
  buildMeiliFilters,
  buildMeiliSort,
  computeFacetDistribution,
  escapeMeiliFilterValue,
  parseFacetedParams,
  sortDocs,
} from './faceted'
import type { ProductDocument } from './meili-settings'

function params(query: string) {
  return new URLSearchParams(query)
}

function doc(overrides: Partial<ProductDocument>): ProductDocument {
  return {
    id: 'p1',
    slug: 'p1',
    name_he: 'מוצר',
    name_en: null,
    brand: null,
    short_description_he: null,
    description_he: null,
    sku: null,
    type: 'physical',
    kenyon_price: 1000,
    full_price: null,
    images: [],
    stock_quantity: null,
    in_stock: true,
    category_id: null,
    category_slug: null,
    category_name_he: null,
    supplier_id: null,
    supplier_name: null,
    city: null,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('parseFacetedParams', () => {
  it('accepts a plain faceted query', () => {
    const outcome = parseFacetedParams(
      params('q=מסעדה&type=coupon&category=restaurants&city=תל אביב&price_min=1000&price_max=5000'),
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.params).toMatchObject({
      q: 'מסעדה',
      type: 'coupon',
      category: 'restaurants',
      city: 'תל אביב',
      priceMin: 1000,
      priceMax: 5000,
    })
  })

  it('refuses a type outside the storefront enum', () => {
    // The whitelist is the rule from ARCHITECTURE-SEARCH-DISCOVERY.md section 6:
    // a crafted facet value must never become a filter expression.
    const outcome = parseFacetedParams(params('type=coupon" OR 1'))
    expect(outcome).toEqual({ ok: false, error: 'invalid_type' })
  })

  it('refuses a float price: money is agorot, integer only', () => {
    expect(parseFacetedParams(params('price_min=12.50'))).toEqual({
      ok: false,
      error: 'invalid_price',
    })
    expect(parseFacetedParams(params('price_max=-5'))).toEqual({
      ok: false,
      error: 'invalid_price',
    })
  })

  it('refuses an inverted price range instead of silently returning nothing', () => {
    expect(parseFacetedParams(params('price_min=5000&price_max=1000'))).toEqual({
      ok: false,
      error: 'invalid_price',
    })
  })

  it('refuses an unknown sort and an unparseable in_stock', () => {
    expect(parseFacetedParams(params('sort=cheapest'))).toEqual({
      ok: false,
      error: 'invalid_sort',
    })
    expect(parseFacetedParams(params('in_stock=yes'))).toEqual({
      ok: false,
      error: 'invalid_in_stock',
    })
  })

  it('drops a facet value carrying control characters', () => {
    const outcome = parseFacetedParams(params('q=x&brand=%00LG'))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.params.brand).toBeUndefined()
  })

  it('caps limit and offset rather than refusing them', () => {
    const outcome = parseFacetedParams(params('limit=9999&offset=999999'))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.params.limit).toBe(48)
    expect(outcome.params.offset).toBe(1000)
  })
})

describe('buildMeiliFilters', () => {
  const base = { q: '', limit: 24, offset: 0 }

  it('quotes and escapes every string value', () => {
    const filters = buildMeiliFilters({ ...base, brand: 'מותג "מיוחד" \\ בעמ' })
    expect(filters).toEqual(['brand = "מותג \\"מיוחד\\" \\\\ בעמ"'])
  })

  it('emits numbers bare and booleans bare, never quoted', () => {
    const filters = buildMeiliFilters({ ...base, inStock: true, priceMin: 100, priceMax: 200 })
    expect(filters).toEqual(['in_stock = true', 'kenyon_price >= 100', 'kenyon_price <= 200'])
  })

  it('emits nothing for an unfiltered query', () => {
    expect(buildMeiliFilters(base)).toEqual([])
  })
})

describe('escapeMeiliFilterValue', () => {
  it('a quote in the value stays a value', () => {
    expect(escapeMeiliFilterValue('a"b')).toBe('"a\\"b"')
  })
})

describe('buildMeiliSort', () => {
  it('maps the three named sorts and nothing else', () => {
    expect(buildMeiliSort('price_asc')).toEqual(['kenyon_price:asc'])
    expect(buildMeiliSort('price_desc')).toEqual(['kenyon_price:desc'])
    expect(buildMeiliSort('newest')).toEqual(['created_at:desc'])
    expect(buildMeiliSort(undefined)).toBeUndefined()
  })
})

describe('the Postgres fallback mirrors the engine', () => {
  const docs = [
    doc({ id: 'a', type: 'coupon', brand: 'LG', city: 'תל אביב', kenyon_price: 1000 }),
    doc({ id: 'b', type: 'coupon', brand: 'LG', city: 'חיפה', kenyon_price: 3000, tags: ['מבצע'] }),
    doc({ id: 'c', type: 'physical', brand: null, city: 'תל אביב', kenyon_price: 2000 }),
    doc({ id: 'd', type: 'physical', kenyon_price: null, in_stock: false }),
  ]

  it('ANDs the filters exactly like the engine would', () => {
    const out = applyFacetFilters(docs, {
      q: '',
      limit: 24,
      offset: 0,
      type: 'coupon',
      city: 'תל אביב',
    })
    expect(out.map((d) => d.id)).toEqual(['a'])
  })

  it('a price ceiling excludes an unpriced product rather than including it', () => {
    const out = applyFacetFilters(docs, { q: '', limit: 24, offset: 0, priceMax: 2500 })
    expect(out.map((d) => d.id)).toEqual(['a', 'c'])
  })

  it('counts facets over the filtered set, Meilisearch semantics', () => {
    const distribution = computeFacetDistribution(
      applyFacetFilters(docs, { q: '', limit: 24, offset: 0, type: 'coupon' }),
    )
    expect(distribution.brand).toEqual({ LG: 2 })
    expect(distribution.city).toEqual({ 'תל אביב': 1, חיפה: 1 })
    expect(distribution.tags).toEqual({ מבצע: 1 })
    expect(distribution.in_stock).toEqual({ true: 2 })
  })

  it('sorts by price with the unpriced last, and by newest by created_at', () => {
    expect(sortDocs(docs, 'price_asc').map((d) => d.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(sortDocs(docs, 'price_desc').map((d) => d.id)).toEqual(['b', 'c', 'a', 'd'])
    const dated = [
      doc({ id: 'old', created_at: '2025-01-01T00:00:00Z' }),
      doc({ id: 'new', created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(sortDocs(dated, 'newest').map((d) => d.id)).toEqual(['new', 'old'])
  })

  it('leaves relevance order untouched when no sort is asked for', () => {
    expect(sortDocs(docs, undefined)).toBe(docs)
  })
})
