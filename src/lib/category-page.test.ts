import { describe, expect, it } from 'vitest'
import { orderedByMenu, parseProductType, productTypeFilter } from './category-page'

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
