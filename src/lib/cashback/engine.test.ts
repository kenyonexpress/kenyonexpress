import { describe, expect, it } from 'vitest'

import { agorot } from '../money'
import {
  EVERY_FIFTH_PURCHASE_CASHBACK_BP,
  FIRST_PURCHASE_CASHBACK_BP,
  NO_CASHBACK_BP,
  cashbackForPurchase,
  cashbackRateBp,
} from './engine'

describe('cashbackRateBp', () => {
  it('gives 10% (1000 bp) on the first purchase', () => {
    expect(cashbackRateBp(1)).toBe(FIRST_PURCHASE_CASHBACK_BP)
    expect(cashbackRateBp(1)).toBe(1000)
  })

  it('gives 5% (500 bp) on every fifth purchase', () => {
    for (const n of [5, 10, 15, 100, 1005]) {
      expect(cashbackRateBp(n)).toBe(EVERY_FIFTH_PURCHASE_CASHBACK_BP)
      expect(cashbackRateBp(n)).toBe(500)
    }
  })

  it('gives 0 bp on every other purchase', () => {
    for (const n of [2, 3, 4, 6, 7, 8, 9, 11, 101]) {
      expect(cashbackRateBp(n)).toBe(NO_CASHBACK_BP)
      expect(cashbackRateBp(n)).toBe(0)
    }
  })

  it('rejects non-positive, fractional, and non-finite purchase numbers', () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => cashbackRateBp(n)).toThrow(RangeError)
    }
  })
})

describe('cashbackForPurchase', () => {
  it('pays 10% of the first purchase, in agorot', () => {
    // 100.00 ILS -> 10.00 ILS cashback.
    expect(cashbackForPurchase(1, agorot(10_000))).toBe(1_000)
  })

  it('pays 5% of every fifth purchase, in agorot', () => {
    // 200.00 ILS -> 10.00 ILS cashback on the 5th purchase.
    expect(cashbackForPurchase(5, agorot(20_000))).toBe(1_000)
    expect(cashbackForPurchase(10, agorot(20_000))).toBe(1_000)
  })

  it('pays nothing on purchases with no cashback rule', () => {
    expect(cashbackForPurchase(2, agorot(20_000))).toBe(0)
    expect(cashbackForPurchase(7, agorot(20_000))).toBe(0)
  })

  it('pays nothing on a zero-amount purchase', () => {
    expect(cashbackForPurchase(1, agorot(0))).toBe(0)
    expect(cashbackForPurchase(5, agorot(0))).toBe(0)
  })

  it('rounds half-up with integer arithmetic', () => {
    // 5% of 10 agorot = 0.5 agorot -> rounds up to 1.
    expect(cashbackForPurchase(5, agorot(10))).toBe(1)
    // 5% of 9 agorot = 0.45 agorot -> rounds down to 0.
    expect(cashbackForPurchase(5, agorot(9))).toBe(0)
    // 10% of 15 agorot = 1.5 agorot -> rounds up to 2.
    expect(cashbackForPurchase(1, agorot(15))).toBe(2)
  })

  it('always returns an integer number of agorot', () => {
    for (const amount of [1, 3, 7, 99, 12_345, 1_000_001]) {
      for (const n of [1, 2, 5]) {
        const cashback = cashbackForPurchase(n, agorot(amount))
        expect(Number.isSafeInteger(cashback)).toBe(true)
        expect(cashback).toBeGreaterThanOrEqual(0)
        expect(cashback).toBeLessThanOrEqual(amount)
      }
    }
  })

  it('rejects negative amounts', () => {
    expect(() => cashbackForPurchase(1, agorot(-100))).toThrow(RangeError)
  })

  it('rejects invalid purchase numbers before touching the amount', () => {
    expect(() => cashbackForPurchase(0, agorot(100))).toThrow(RangeError)
  })
})
