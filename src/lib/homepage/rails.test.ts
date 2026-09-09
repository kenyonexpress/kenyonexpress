import { type RailProduct, discountFraction, rankByRule } from '@/lib/homepage/rails'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-09-09T12:00:00Z')

function product(overrides: Partial<RailProduct> & { id: string }): RailProduct {
  return {
    slug: overrides.id,
    name_he: overrides.id,
    kenyon_price: null,
    full_price: null,
    images: [],
    stock_quantity: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    offer_valid_until: null,
    supplier_id: null,
    category_id: null,
    ...overrides,
  }
}

describe('discountFraction', () => {
  it('is the fraction off the reference price', () => {
    expect(discountFraction({ kenyon_price: 50, full_price: 100 })).toBe(0.5)
  })

  it('is zero when there is no reference price', () => {
    // Not NaN, and not "infinitely cheap". A product with no `full_price` would
    // otherwise sort as if it were free.
    expect(discountFraction({ kenyon_price: 50, full_price: null })).toBe(0)
  })

  it('is zero when the product is not actually cheaper', () => {
    expect(discountFraction({ kenyon_price: 100, full_price: 100 })).toBe(0)
    expect(discountFraction({ kenyon_price: 120, full_price: 100 })).toBe(0)
  })

  it('is zero for a nonsensical reference price rather than negative', () => {
    expect(discountFraction({ kenyon_price: 10, full_price: 0 })).toBe(0)
  })
})

describe('rankByRule', () => {
  const pool = [
    product({
      id: 'old-cheap',
      created_at: '2025-01-01T00:00:00.000Z',
      kenyon_price: 10,
      full_price: 100,
    }),
    product({ id: 'new-plain', created_at: '2026-09-01T00:00:00.000Z' }),
    product({
      id: 'mid-discount',
      created_at: '2026-05-01T00:00:00.000Z',
      kenyon_price: 80,
      full_price: 100,
    }),
    product({ id: 'ends-tomorrow', offer_valid_until: '2026-09-10T12:00:00.000Z' }),
    product({ id: 'ends-next-week', offer_valid_until: '2026-09-16T12:00:00.000Z' }),
    product({ id: 'ended-yesterday', offer_valid_until: '2026-09-08T12:00:00.000Z' }),
  ]
  const ids = (rows: RailProduct[]) => rows.map((row) => row.id)

  it('orders newest by creation, most recent first', () => {
    expect(ids(rankByRule(pool, 'newest', NOW))[0]).toBe('new-plain')
  })

  it('orders biggest_discount by fraction and drops everything undiscounted', () => {
    expect(ids(rankByRule(pool, 'biggest_discount', NOW))).toEqual(['old-cheap', 'mid-discount'])
  })

  it('excludes a product with no deadline from ending_soon rather than sorting it last', () => {
    // "Soon" is a claim. A product with no `offer_valid_until` would be making
    // it falsely, and padding the rail with one is worse than a shorter rail.
    const ranked = ids(rankByRule(pool, 'ending_soon', NOW))
    expect(ranked).toEqual(['ends-tomorrow', 'ends-next-week'])
    expect(ranked).not.toContain('new-plain')
  })

  it('excludes an offer that has already ended', () => {
    expect(ids(rankByRule(pool, 'ending_soon', NOW))).not.toContain('ended-yesterday')
  })

  it('returns nothing rather than throwing when no product matches', () => {
    // The live case: measured 2026-09-09, `offer_valid_until` is null on all 44
    // active products, so this rule matches zero. `ProductRail` renders nothing
    // for an empty list and the admin console prints the count.
    const noDeadlines = [product({ id: 'a' }), product({ id: 'b' })]
    expect(rankByRule(noDeadlines, 'ending_soon', NOW)).toEqual([])
  })

  it('does not mutate the pool it was given', () => {
    const original = ids(pool)
    rankByRule(pool, 'newest', NOW)
    expect(ids(pool)).toEqual(original)
  })
})
