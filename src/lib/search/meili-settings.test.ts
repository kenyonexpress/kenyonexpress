import { describe, expect, it } from 'vitest'
import {
  FILTERABLE_ATTRIBUTES,
  INDEX_SETTINGS,
  RANKING_RULES,
  SEARCHABLE_ATTRIBUTES,
  TYPO_TOLERANCE,
  toProductDocument,
} from './meili-settings'

describe('typo tolerance is tuned for Hebrew, not left on the default', () => {
  it('allows one typo from four characters, not five', () => {
    // Meilisearch's default is 5. מסעדה is exactly 5 and בגד is 3, so the
    // default gives a large part of the Hebrew catalogue no typo budget at all.
    expect(TYPO_TOLERANCE.minWordSizeForTypos.oneTypo).toBe(4)
    expect(TYPO_TOLERANCE.minWordSizeForTypos.twoTypos).toBe(7)
  })

  it('never fuzzy-matches an identifier', () => {
    // A one-character slip in a SKU must return nothing, not a wrong product.
    for (const attribute of ['sku', 'slug', 'barcode']) {
      expect(TYPO_TOLERANCE.disableOnAttributes).toContain(attribute)
    }
  })

  it('stays enabled', () => {
    expect(INDEX_SETTINGS.typoTolerance.enabled).toBe(true)
  })
})

describe('index settings', () => {
  it('ranks a name hit above a description hit', () => {
    // searchableAttributes is order-sensitive in Meilisearch.
    const name = SEARCHABLE_ATTRIBUTES.indexOf('name_he')
    const description = SEARCHABLE_ATTRIBUTES.indexOf('description_he')
    expect(name).toBeGreaterThanOrEqual(0)
    expect(name).toBeLessThan(description)
  })

  it('prefers an in-stock near match to an unbuyable exact one', () => {
    expect(RANKING_RULES.indexOf('in_stock:desc')).toBeLessThan(RANKING_RULES.indexOf('proximity'))
  })

  it('can filter on every facet the storefront exposes', () => {
    for (const facet of ['type', 'category_slug', 'kenyon_price', 'in_stock']) {
      expect(FILTERABLE_ATTRIBUTES).toContain(facet)
    }
  })
})

describe('toProductDocument', () => {
  const row = {
    id: 'p1',
    slug: 'coupon-test',
    name_he: 'קופון טסט',
    stock_quantity: 4,
    categories: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty' },
  }

  it('flattens the category join for filtering and search', () => {
    expect(toProductDocument(row)).toMatchObject({
      category_slug: 'beauty',
      category_name_he: 'יופי בריאות וטיפוח',
    })
  })

  it('accepts the array shape Supabase returns for a join', () => {
    const doc = toProductDocument({ ...row, categories: [{ name_he: 'ספא', slug: 'spa' }] })
    expect(doc.category_slug).toBe('spa')
  })

  it('treats a coupon-enabled product as a coupon whatever its type column says', () => {
    // Same reading as lib/cart/pricing.ts; the facet must agree with the cart.
    const doc = toProductDocument({ ...row, type: 'physical', is_coupon_enabled: true })
    expect(doc.type).toBe('coupon')
  })

  it('precomputes in_stock, treating untracked stock as available', () => {
    expect(toProductDocument({ ...row, stock_quantity: null }).in_stock).toBe(true)
    expect(toProductDocument({ ...row, stock_quantity: 0 }).in_stock).toBe(false)
    expect(toProductDocument({ ...row, stock_quantity: 4 }).in_stock).toBe(true)
  })

  it('carries the supplier name so a shop can be found by its own name', () => {
    expect(toProductDocument(row, 'ספא רויאל').supplier_name).toBe('ספא רויאל')
    expect(toProductDocument(row).supplier_name).toBeNull()
  })
})

describe('city and tags in the index', () => {
  const base = { id: 'p1', slug: 's', name_he: 'ארוחה', categories: null }

  it('indexes and facets on both', () => {
    // The goal names עיר and tags as searchable AND filterable.
    expect(SEARCHABLE_ATTRIBUTES).toContain('city')
    expect(SEARCHABLE_ATTRIBUTES).toContain('tags')
    expect(FILTERABLE_ATTRIBUTES).toContain('city')
    expect(FILTERABLE_ATTRIBUTES).toContain('tags')
  })

  it('ranks a city hit above the description', () => {
    // searchableAttributes is an importance ranking. "מסעדה תל אביב" is a
    // place-and-thing query, so the city must outrank the same word buried in
    // marketing copy.
    const order = SEARCHABLE_ATTRIBUTES as readonly string[]
    expect(order.indexOf('city')).toBeLessThan(order.indexOf('description_he'))
  })

  it('falls back to the supplier city, matching productLocation()', () => {
    const doc = toProductDocument(base as never, 'ספק', 'תל אביב')
    expect(doc.city).toBe('תל אביב')
  })

  it("prefers the product's own city over the supplier's", () => {
    const doc = toProductDocument({ ...base, city: 'אילת' } as never, 'ספק', 'תל אביב')
    expect(doc.city).toBe('אילת')
  })

  it('survives the columns being absent entirely', () => {
    // They reach the row only when the query selects them. An absent column
    // must index as "no city"/"no tags", never throw and leave the whole
    // catalogue unsearchable.
    const doc = toProductDocument(base as never, null, null)
    expect(doc.city).toBeNull()
    expect(doc.tags).toEqual([])
  })

  it('normalises tags to a clean array', () => {
    const doc = toProductDocument(
      { ...base, tags: ['מבצע', '', '  ', 7, null, 'מתנה'] } as never,
      null,
      null,
    )
    expect(doc.tags).toEqual(['מבצע', 'מתנה'])
  })
})
