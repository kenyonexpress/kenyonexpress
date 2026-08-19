import { describe, expect, it } from 'vitest'
import {
  collectionFilter,
  collectionRule,
  orderedByMenu,
  parseProductType,
  productTypeFilter,
} from './category-page'

/**
 * The archive facet has to agree with the rest of the system about what a
 * coupon is. It did not: it filtered on the `type` column alone, while the
 * product page, lib/cart/pricing.ts, the commission engine and the Meilisearch
 * document builder all also treat `is_coupon_enabled` as a coupon.
 *
 * The visible consequence was `barbecue` — type 'physical', is_coupon_enabled
 * true — which is sold as a coupon, priced by coupon_price_ils and settled
 * 100% to the platform, and which did not appear in the coupon archive.
 */
describe('productTypeFilter', () => {
  it('counts a coupon-enabled product as a coupon, not only type = coupon', () => {
    const filter = productTypeFilter('coupon')
    expect(filter.column).toBe('or')
    expect(filter.value).toContain('type.eq.coupon')
    expect(filter.value).toContain('is_coupon_enabled.is.true')
  })

  it('makes physical the strict complement, so the two facets partition the catalogue', () => {
    // If both facets could match the same row, the two counts would overlap and
    // stop adding up to the unfiltered total.
    const filter = productTypeFilter('physical')
    expect(filter.value).toContain('type.neq.coupon')
    expect(filter.value).toContain('is_coupon_enabled.is.false')
  })

  it('never returns the naive equality that caused the mismatch', () => {
    for (const type of ['coupon', 'physical'] as const) {
      expect(productTypeFilter(type).column).not.toBe('type')
    }
  })
})

describe('parseProductType', () => {
  it('accepts the two real values', () => {
    expect(parseProductType('coupon')).toBe('coupon')
    expect(parseProductType('physical')).toBe('physical')
  })

  it('ignores anything else rather than filtering on it', () => {
    // A bad ?type= must widen to "no filter", not to an empty archive.
    for (const raw of ['service', 'COUPON', '', undefined, ['coupon'], 'coupon; drop table']) {
      expect(parseProductType(raw as string | string[] | undefined)).toBeUndefined()
    }
  })
})

/**
 * The sidebar order. `categories.sort_order` is not unique, and on 19.08.2026
 * production had `electronics` and `professionals` both on 10, so the column
 * alone does not define an order at all. These reads are `use cache` for an
 * hour, so whichever way the planner happened to return them is what the
 * sidebar shows for the rest of that hour.
 */
describe('orderedByMenu', () => {
  const fake = () => {
    const calls: [string, { ascending: boolean }][] = []
    const query = {
      order(column: string, opts: { ascending: boolean }) {
        calls.push([column, opts])
        return query
      },
    }
    return { query, calls }
  }

  it('breaks a sort_order tie on slug, which is unique', () => {
    const { query, calls } = fake()
    orderedByMenu(query)
    expect(calls).toEqual([
      ['sort_order', { ascending: true }],
      ['slug', { ascending: true }],
    ])
  })

  it('keeps sort_order as the first key, so the menu order still wins', () => {
    const { query, calls } = fake()
    orderedByMenu(query)
    expect(calls[0]?.[0]).toBe('sort_order')
  })

  it('returns the query so it stays chainable', () => {
    const { query } = fake()
    expect(orderedByMenu(query)).toBe(query)
  })
})

/**
 * The three collections. Measured on production 19.08.2026: hot-deals held 4
 * active products, under-99 3 and new 3, and nine of those ten were demo rows
 * placed by hand. Nothing falls into a collection on its own, because
 * `categories` has no column that expresses a rule.
 */
describe('collectionRule', () => {
  it('claims exactly the three collection slugs', () => {
    expect(collectionRule('under-99')).toEqual({ kind: 'price_max', maxIls: 99 })
    expect(collectionRule('hot-deals')).toEqual({ kind: 'featured' })
    expect(collectionRule('new')).toEqual({ kind: 'newest', limit: 24 })
  })

  it('leaves every taxonomy alone, so those still match on category_id', () => {
    for (const slug of [
      'restaurants-cafes',
      'beauty-health',
      'phones-computers',
      'baby-kids',
      'vacation',
      'pets',
      'professionals',
      'courses',
      'electronics',
    ]) {
      expect(collectionRule(slug), slug).toBeUndefined()
    }
  })

  it('does not answer for a slug that is not a category at all', () => {
    // Object.prototype keys reach a bare record lookup. `constructor` would
    // return a function, and a function is truthy.
    expect(collectionRule('constructor')).toBeUndefined()
    expect(collectionRule('toString')).toBeUndefined()
    expect(collectionRule('__proto__')).toBeUndefined()
  })
})

describe('collectionFilter', () => {
  const ID = 'bd5932c1-51a8-47a5-b64c-551b8692b53c'

  it('always keeps the hand-assigned rows, so a page can only gain products', () => {
    for (const rule of [
      { kind: 'price_max', maxIls: 99 },
      { kind: 'featured' },
      { kind: 'newest', limit: 24 },
    ] as const) {
      expect(collectionFilter(ID, rule, ['a']), rule.kind).toContain(`category_id.eq.${ID}`)
    }
  })

  it('bounds under-99 on kenyon_price, the price the card shows', () => {
    expect(collectionFilter(ID, { kind: 'price_max', maxIls: 99 })).toBe(
      `category_id.eq.${ID},kenyon_price.lte.99`,
    )
  })

  it('reads hot-deals off is_featured', () => {
    expect(collectionFilter(ID, { kind: 'featured' })).toBe(
      `category_id.eq.${ID},is_featured.is.true`,
    )
  })

  it('lists the newest ids explicitly', () => {
    expect(collectionFilter(ID, { kind: 'newest', limit: 24 }, ['x', 'y'])).toBe(
      `category_id.eq.${ID},id.in.(x,y)`,
    )
  })

  it('never emits an empty in.() group, which is a PostgREST syntax error', () => {
    // With no ids the group has to collapse to the hand-assigned rows rather
    // than to `id.in.()`, which would fail the whole request and empty the page.
    const filter = collectionFilter(ID, { kind: 'newest', limit: 24 }, [])
    expect(filter).toBe(`category_id.eq.${ID}`)
    expect(filter).not.toContain('in.()')
  })
})
