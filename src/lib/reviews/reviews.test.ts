import { describe, expect, it } from 'vitest'
import { reviewSchema, summarizeRatings } from './reviews'

describe('reviewSchema', () => {
  const base = {
    productId: '00000000-0000-4000-8000-000000000001',
    orderItemId: '00000000-0000-4000-8000-000000000002',
  }

  it('accepts a whole rating in range, with or without body', () => {
    expect(reviewSchema.safeParse({ ...base, rating: 1 }).success).toBe(true)
    expect(reviewSchema.safeParse({ ...base, rating: 5, body: 'מעולה' }).success).toBe(true)
  })

  it('refuses ratings outside 1..5 and non-integers', () => {
    for (const rating of [0, 6, 4.5, -1, Number.NaN]) {
      expect(reviewSchema.safeParse({ ...base, rating }).success).toBe(false)
    }
  })

  it('refuses a body over 1000 characters and non-uuid ids', () => {
    expect(reviewSchema.safeParse({ ...base, rating: 4, body: 'א'.repeat(1001) }).success).toBe(
      false,
    )
    expect(reviewSchema.safeParse({ ...base, orderItemId: 'not-a-uuid', rating: 4 }).success).toBe(
      false,
    )
  })
})

describe('summarizeRatings', () => {
  it('is null on empty -- unrated is not zero-rated', () => {
    expect(summarizeRatings([])).toBeNull()
  })

  it('averages to one decimal with integer math', () => {
    expect(summarizeRatings([5, 4, 4])).toEqual({ count: 3, average: 4.3 })
    expect(summarizeRatings([1, 5])).toEqual({ count: 2, average: 3 })
    expect(summarizeRatings([5])).toEqual({ count: 1, average: 5 })
  })

  it('throws on a rating the DB CHECK would refuse', () => {
    expect(() => summarizeRatings([3, 0])).toThrow()
    expect(() => summarizeRatings([2.5])).toThrow()
  })
})
