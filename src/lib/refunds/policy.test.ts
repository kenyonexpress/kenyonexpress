import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { decideRefund } from './policy'

const bought = new Date('2026-10-01T10:00:00Z')
const day = (n: number) => new Date(bought.getTime() + n * 86_400_000)

describe('decideRefund', () => {
  it('coupon in window takes 5% fee', () => {
    const d = decideRefund({
      kind: 'coupon',
      paidAgorot: agorot(10_000),
      purchasedAt: bought,
      now: day(3),
    })
    expect(d).toEqual({ refundable: true, refundAgorot: 9_500, feeAgorot: 500 })
  })
  it('coupon fee caps at 100 ILS', () => {
    const d = decideRefund({
      kind: 'coupon',
      paidAgorot: agorot(1_000_000),
      purchasedAt: bought,
      now: day(14),
    })
    expect(d).toEqual({ refundable: true, refundAgorot: 990_000, feeAgorot: 10_000 })
  })
  it('coupon after 14 days gets nothing', () => {
    const d = decideRefund({
      kind: 'coupon',
      paidAgorot: agorot(10_000),
      purchasedAt: bought,
      now: day(15),
    })
    expect(d).toEqual({ refundable: false, reason: 'window_closed' })
  })
  it('redeemed coupon gets nothing', () => {
    const d = decideRefund({
      kind: 'coupon',
      paidAgorot: agorot(10_000),
      purchasedAt: bought,
      now: day(1),
      redeemed: true,
    })
    expect(d).toEqual({ refundable: false, reason: 'redeemed' })
  })
  it('physical defaults to 100%', () => {
    const d = decideRefund({
      kind: 'physical',
      paidAgorot: agorot(12_345),
      purchasedAt: bought,
      now: day(40),
    })
    expect(d).toEqual({ refundable: true, refundAgorot: 12_345, feeAgorot: 0 })
  })
  it('physical honours a per-product share', () => {
    const d = decideRefund({
      kind: 'physical',
      paidAgorot: agorot(10_000),
      purchasedAt: bought,
      now: day(2),
      productRefundBp: 8_000,
    })
    expect(d).toEqual({ refundable: true, refundAgorot: 8_000, feeAgorot: 2_000 })
  })
  it('cancelled is never refundable again', () => {
    const d = decideRefund({
      kind: 'physical',
      paidAgorot: agorot(100),
      purchasedAt: bought,
      now: day(1),
      cancelled: true,
    })
    expect(d).toEqual({ refundable: false, reason: 'cancelled' })
  })
})
