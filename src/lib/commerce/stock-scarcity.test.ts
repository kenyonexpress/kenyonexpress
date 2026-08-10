import { describe, expect, it } from 'vitest'
import {
  SCARCITY_FRACTION,
  couponStockMessageHebrew,
  isSoldOut,
  stockDisplay,
  stockMessageHebrew,
} from './stock-scarcity'

describe('stockDisplay', () => {
  it('says nothing at all about a product with no stock figure', () => {
    // Most of this catalogue is untracked. Treating null as zero would mark the
    // whole shop sold out, which is the failure this branch exists to prevent.
    expect(stockDisplay({ available: null })).toEqual({ kind: 'untracked' })
    expect(stockDisplay({ available: undefined as unknown as number })).toEqual({
      kind: 'untracked',
    })
  })

  it('is sold out at zero and below', () => {
    expect(stockDisplay({ available: 0, initial: 50 })).toEqual({ kind: 'sold_out' })
    // Negative should be impossible - the reservation is what guarantees it -
    // but if it ever happens it is still sold out, not "minus one left".
    expect(stockDisplay({ available: -3, initial: 50 })).toEqual({ kind: 'sold_out' })
  })

  it('shows the count only below a fifth of the original', () => {
    expect(stockDisplay({ available: 20, initial: 100 })).toEqual({ kind: 'low', remaining: 20 })
    expect(stockDisplay({ available: 21, initial: 100 })).toEqual({ kind: 'in_stock' })
    expect(SCARCITY_FRACTION).toBe(0.2)
  })

  it('scales with the original rather than with an absolute number', () => {
    // Three left is nearly gone out of a hundred and comfortable out of four.
    // A threshold on the raw number would shout on one and stay silent on the
    // other for the same real scarcity.
    expect(stockDisplay({ available: 3, initial: 100 }).kind).toBe('low')
    expect(stockDisplay({ available: 3, initial: 4 }).kind).toBe('in_stock')
  })

  it('still fires on the per-product threshold when the fraction would not', () => {
    // The four-unit restock: a fraction of 0.75 stays silent while the shelf is
    // nearly empty, which is exactly what `low_stock_threshold` is for.
    expect(stockDisplay({ available: 3, initial: 4, threshold: 5 })).toEqual({
      kind: 'low',
      remaining: 3,
    })
  })

  it('falls back to the threshold when no original was ever recorded', () => {
    expect(stockDisplay({ available: 2, initial: null, threshold: 5 }).kind).toBe('low')
    expect(stockDisplay({ available: 9, initial: null, threshold: 5 }).kind).toBe('in_stock')
  })

  it('says nothing when neither rule has anything to go on', () => {
    // No original, no threshold: there is no substantiated claim to make, and
    // inventing urgency is exactly what the law limits.
    expect(stockDisplay({ available: 2, initial: null, threshold: null })).toEqual({
      kind: 'in_stock',
    })
  })

  it('does not divide by a zero or negative original', () => {
    expect(stockDisplay({ available: 5, initial: 0 })).toEqual({ kind: 'in_stock' })
    expect(stockDisplay({ available: 5, initial: -10 })).toEqual({ kind: 'in_stock' })
  })
})

describe('stockMessageHebrew', () => {
  it('uses the singular and the dual, because Hebrew has both', () => {
    expect(stockMessageHebrew({ kind: 'low', remaining: 1 })).toBe('נותרה יחידה אחרונה')
    expect(stockMessageHebrew({ kind: 'low', remaining: 2 })).toBe('נותרו שתי יחידות')
    expect(stockMessageHebrew({ kind: 'low', remaining: 7 })).toBe('נותרו 7 יחידות')
  })

  it('returns null rather than an empty string when nothing should be said', () => {
    // An empty string renders as a badge with no text, which looks like a bug.
    expect(stockMessageHebrew({ kind: 'in_stock' })).toBeNull()
    expect(stockMessageHebrew({ kind: 'untracked' })).toBeNull()
  })

  it('names the sold-out state', () => {
    expect(stockMessageHebrew({ kind: 'sold_out' })).toBe('אזל המלאי')
  })
})

describe('couponStockMessageHebrew', () => {
  it('counts coupons, not units', () => {
    expect(couponStockMessageHebrew({ kind: 'low', remaining: 1 })).toBe('נותר קופון אחרון')
    expect(couponStockMessageHebrew({ kind: 'low', remaining: 2 })).toBe('נותרו שני קופונים')
    expect(couponStockMessageHebrew({ kind: 'low', remaining: 9 })).toBe('נותרו 9 קופונים')
  })

  it('closes the deal rather than emptying a shelf', () => {
    expect(couponStockMessageHebrew({ kind: 'sold_out' })).toBe('הדיל נסגר')
  })
})

describe('isSoldOut', () => {
  it('is the only thing a buy button should read', () => {
    // Never inferred from the message: a copy change must not be able to
    // re-enable a button on a product that has nothing left.
    expect(isSoldOut({ kind: 'sold_out' })).toBe(true)
    expect(isSoldOut({ kind: 'low', remaining: 1 })).toBe(false)
    expect(isSoldOut({ kind: 'untracked' })).toBe(false)
  })
})
