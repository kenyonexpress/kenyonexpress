import { describe, expect, it } from 'vitest'
import {
  type DiscountTier,
  applyGroupDiscount,
  calculateGroupDiscount,
  getNextTier,
} from '../group-purchase-schema'

describe('calculateGroupDiscount', () => {
  const tiers: DiscountTier[] = [
    { minQuantity: 5, discountPercent: 10 },
    { minQuantity: 10, discountPercent: 20 },
    { minQuantity: 25, discountPercent: 30 },
  ]

  it('returns 0 when below minimum tier', () => {
    expect(calculateGroupDiscount(tiers, 3)).toBe(0)
  })

  it('returns first tier discount when threshold met', () => {
    expect(calculateGroupDiscount(tiers, 5)).toBe(10)
    expect(calculateGroupDiscount(tiers, 7)).toBe(10)
  })

  it('returns higher tier when threshold met', () => {
    expect(calculateGroupDiscount(tiers, 10)).toBe(20)
    expect(calculateGroupDiscount(tiers, 15)).toBe(20)
  })

  it('returns highest tier when all thresholds exceeded', () => {
    expect(calculateGroupDiscount(tiers, 25)).toBe(30)
    expect(calculateGroupDiscount(tiers, 100)).toBe(30)
  })
})

describe('applyGroupDiscount', () => {
  it('applies discount correctly', () => {
    expect(applyGroupDiscount(10000, 10)).toBe(9000)
    expect(applyGroupDiscount(10000, 20)).toBe(8000)
    expect(applyGroupDiscount(10000, 50)).toBe(5000)
  })

  it('returns original price for 0% discount', () => {
    expect(applyGroupDiscount(10000, 0)).toBe(10000)
  })

  it('rounds discount amount', () => {
    // 33% of 10000 = 3300, so result is 6700
    expect(applyGroupDiscount(10000, 33)).toBe(6700)
  })
})

describe('getNextTier', () => {
  const tiers: DiscountTier[] = [
    { minQuantity: 5, discountPercent: 10 },
    { minQuantity: 10, discountPercent: 20 },
    { minQuantity: 25, discountPercent: 30 },
  ]

  it('returns first tier when starting', () => {
    const result = getNextTier(tiers, 2)
    expect(result).toEqual({
      tier: { minQuantity: 5, discountPercent: 10 },
      participantsNeeded: 3,
    })
  })

  it('returns next tier when at intermediate level', () => {
    const result = getNextTier(tiers, 7)
    expect(result).toEqual({
      tier: { minQuantity: 10, discountPercent: 20 },
      participantsNeeded: 3,
    })
  })

  it('returns null when at highest tier', () => {
    const result = getNextTier(tiers, 30)
    expect(result).toBeNull()
  })
})
