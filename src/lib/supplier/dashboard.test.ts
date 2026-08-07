import { describe, expect, it } from 'vitest'
import {
  type SupplierRedemptionRow,
  type SupplierSaleLine,
  aggregateDashboard,
  sumPayoutBreakdown,
  supplierDueAgorot,
  toPayoutBreakdown,
} from './dashboard'

const sale = (partial: Partial<SupplierSaleLine>): SupplierSaleLine => ({
  orderItemId: 'oi-1',
  orderId: 'o-1',
  productName: 'מוצר',
  productType: 'coupon',
  quantity: 1,
  platformPercent: 10,
  faceValueAgorot: 40000,
  paidOnSiteAgorot: 4000,
  platformFeeAgorot: 400,
  supplierImmediateAgorot: 0,
  // Legacy column; ignored under no-Escrow (always 0 in live rows post-085).
  escrowHeldAgorot: 0,
  escrowReleaseAgorot: 0,
  supplierDueAgorot: 0,
  settlementStatus: 'platform_settled',
  paidAt: '2026-08-01T10:00:00Z',
  ...partial,
})

const redemption = (partial: Partial<SupplierRedemptionRow>): SupplierRedemptionRow => ({
  voucherId: 'v-1',
  code: 'ABCDE12345',
  productName: 'קופון',
  customerName: 'דנה',
  remainingAmountDueAgorot: 36000,
  couponPriceAgorot: 4000,
  platformPercent: 10,
  redeemedAt: '2026-08-02T08:00:00+03:00',
  status: 'redeemed',
  ...partial,
})

describe('supplierDueAgorot', () => {
  it('counts only the immediate physical split (ignores legacy held)', () => {
    expect(supplierDueAgorot({ supplierImmediateAgorot: 9000, escrowHeldAgorot: 3600 })).toBe(9000)
  })

  it('is zero on a coupon line', () => {
    expect(supplierDueAgorot({ supplierImmediateAgorot: 0, escrowHeldAgorot: 3600 })).toBe(0)
  })
})

describe('aggregateDashboard', () => {
  it('counts today redemptions and till collect without inventing escrow', () => {
    const stats = aggregateDashboard({
      sales: [sale({})],
      redemptions: [
        redemption({ redeemedAt: '2026-08-02T08:00:00+03:00' }),
        redemption({
          voucherId: 'v-2',
          redeemedAt: '2026-07-01T08:00:00+03:00',
          remainingAmountDueAgorot: 1000,
        }),
      ],
      now: new Date('2026-08-02T12:00:00+03:00'),
    })
    expect(stats.redemptionsToday).toBe(1)
    expect(stats.tillCollectedTodayAgorot).toBe(36000)
    expect(stats.platformFeeAgorot).toBe(400)
    expect(stats.supplierDueAgorot).toBe(0)
    expect(stats.couponRedemptionsTotal).toBe(2)
  })
})

describe('toPayoutBreakdown', () => {
  it('uses on-site prepayment as gross for coupons and pays the supplier nothing from us', () => {
    const [line] = toPayoutBreakdown([sale({})])
    expect(line?.grossAgorot).toBe(4000)
    expect(line?.platformFeeAgorot).toBe(400)
    expect(line?.supplierPayoutAgorot).toBe(0)
    expect(line?.platformPercent).toBe(10)
  })

  it('uses face value as gross for physical', () => {
    const [line] = toPayoutBreakdown([
      sale({
        productType: 'physical',
        faceValueAgorot: 10000,
        paidOnSiteAgorot: 10000,
        platformFeeAgorot: 1000,
        supplierImmediateAgorot: 9000,
        escrowHeldAgorot: 0,
        supplierDueAgorot: 9000,
      }),
    ])
    expect(line?.grossAgorot).toBe(10000)
    expect(line?.supplierPayoutAgorot).toBe(9000)
  })

  it('sums totals', () => {
    const lines = toPayoutBreakdown([
      sale({}),
      sale({
        orderItemId: 'oi-2',
        productType: 'physical',
        faceValueAgorot: 10000,
        paidOnSiteAgorot: 10000,
        platformFeeAgorot: 1000,
        supplierImmediateAgorot: 9000,
        escrowHeldAgorot: 0,
        supplierDueAgorot: 9000,
      }),
    ])
    expect(sumPayoutBreakdown(lines)).toEqual({
      grossAgorot: 14000,
      platformFeeAgorot: 1400,
      supplierPayoutAgorot: 9000,
    })
  })
})
