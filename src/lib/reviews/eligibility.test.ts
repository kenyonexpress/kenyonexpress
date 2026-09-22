import { describe, expect, it } from 'vitest'
import { type ReviewDraft, aggregateRatings, formatAverageHe, refuseReview } from './eligibility'

const BASE: ReviewDraft = {
  userId: 'u1',
  orderUserId: 'u1',
  orderStatus: 'paid',
  productId: 'p1',
  lineProductId: 'p1',
  orderItemId: 'oi1',
  rating: 5,
  body: 'מעולה',
  existing: [],
}

describe('refuseReview', () => {
  it('accepts a first review of a paid purchase', () => {
    expect(refuseReview(BASE)).toBeNull()
  })

  it('refuses a second live review of the same product', () => {
    expect(
      refuseReview({
        ...BASE,
        orderItemId: 'oi2',
        existing: [{ orderItemId: 'oi1', productId: 'p1', deletedAt: null }],
      }),
    ).toBe('duplicate_product')
  })

  it('allows a retry after the previous row was soft-deleted', () => {
    expect(
      refuseReview({
        ...BASE,
        existing: [{ orderItemId: 'oi1', productId: 'p1', deletedAt: '2026-01-01T00:00:00Z' }],
      }),
    ).toBeNull()
  })

  it('refuses an unpaid order and a non-integer rating', () => {
    expect(refuseReview({ ...BASE, orderStatus: 'pending' })).toBe('not_paid')
    expect(refuseReview({ ...BASE, rating: 4.5 })).toBe('bad_rating')
  })
})

describe('aggregateRatings', () => {
  it('returns null when there is nothing to average', () => {
    expect(aggregateRatings([])).toBeNull()
    expect(aggregateRatings([0, 9])).toBeNull()
  })

  it('reports tenths without floating point', () => {
    const agg = aggregateRatings([5, 4, 4])
    expect(agg).toEqual({ count: 3, averageTenths: 43 })
    expect(formatAverageHe(43)).toBe('4.3')
  })
})
