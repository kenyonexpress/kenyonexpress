import { describe, expect, it } from 'vitest'
import { formatRate, redemptionRate, refundRate } from './rates'

describe('refundRate', () => {
  it('divides refunded by paid', () => {
    expect(refundRate({ paidOrders: 200, refundedOrders: 7 }).value).toBeCloseTo(0.035)
  })

  it('returns null rather than 0% when nothing was paid', () => {
    // The whole reason this module exists. "0% refunds" on an empty window
    // reads as a good month and means no data.
    const r = refundRate({ paidOrders: 0, refundedOrders: 0 })
    expect(r.value).toBeNull()
    expect(formatRate(r)).toBe('—')
  })

  it('keeps the counts so a tile can show 7 / 200', () => {
    const r = refundRate({ paidOrders: 200, refundedOrders: 7 })
    expect([r.numerator, r.denominator]).toEqual([7, 200])
  })

  it('can reach 100% when every paid order was refunded', () => {
    expect(refundRate({ paidOrders: 3, refundedOrders: 3 }).value).toBe(1)
  })
})

describe('redemptionRate', () => {
  it('excludes cancelled and refunded vouchers from the denominator', () => {
    // 100 issued, 10 cancelled, 10 refunded -> 80 redeemable, 40 redeemed.
    const r = redemptionRate({ issued: 100, redeemed: 40, cancelled: 10, refunded: 10 })
    expect(r.denominator).toBe(80)
    expect(r.value).toBe(0.5)
  })

  it('counts expired vouchers as unredeemed, because that is what they are', () => {
    // Nothing removes expired from the denominator; 50 of 100 redeemed is 50%
    // whether the other 50 expired or are still live.
    const r = redemptionRate({ issued: 100, redeemed: 50, cancelled: 0, refunded: 0 })
    expect(r.value).toBe(0.5)
  })

  it('returns null when every voucher was withdrawn', () => {
    const r = redemptionRate({ issued: 5, redeemed: 0, cancelled: 3, refunded: 2 })
    expect(r.denominator).toBe(0)
    expect(r.value).toBeNull()
  })

  it('returns null on an empty window', () => {
    expect(redemptionRate({ issued: 0, redeemed: 0, cancelled: 0, refunded: 0 }).value).toBeNull()
  })

  it('never returns a negative denominator', () => {
    // Defensive: if the counts ever disagree, a dash beats a nonsense figure.
    const r = redemptionRate({ issued: 1, redeemed: 0, cancelled: 5, refunded: 0 })
    expect(r.value).toBeNull()
    expect(r.denominator).toBe(0)
  })
})

describe('formatRate', () => {
  it('renders one decimal place', () => {
    expect(formatRate({ value: 0.0734, numerator: 734, denominator: 10000 })).toBe('7.3%')
  })

  it('renders a dash for an unmeasurable rate', () => {
    expect(formatRate({ value: null, numerator: 0, denominator: 0 })).toBe('—')
  })
})
