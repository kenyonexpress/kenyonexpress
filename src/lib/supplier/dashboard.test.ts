import { describe, expect, it } from 'vitest'
import {
  type SupplierRedemptionRow,
  type SupplierSaleLine,
  aggregateDashboard,
  sumPayoutBreakdown,
  summarizeSettlement,
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
      reversedPayoutAgorot: 0,
    })
  })
})

describe('a refunded line is due nothing', () => {
  // The line the supplier portal shows after a refund: `settlement_status`
  // flips to `refunded` and `supplier_immediate_agorot` DOES NOT MOVE, because
  // that column is the snapshot of what was agreed at purchase. Reading it as a
  // live receivable is what was wrong. `getSupplierSales` filters on
  // `orders.paid_at IS NOT NULL` and a refunded order keeps its `paid_at`, so
  // these rows do reach the portal.
  const refundedPhysical = sale({
    orderItemId: 'oi-refunded',
    productType: 'physical',
    faceValueAgorot: 10_000,
    paidOnSiteAgorot: 10_000,
    platformFeeAgorot: 1_000,
    supplierImmediateAgorot: 9_000,
    supplierDueAgorot: 9_000,
    settlementStatus: 'refunded',
  })

  it('pays zero and reports the reversal separately', () => {
    expect(supplierDueAgorot(refundedPhysical)).toBe(0)
    const [line] = toPayoutBreakdown([refundedPhysical])
    expect(line?.supplierPayoutAgorot).toBe(0)
    // Not silently dropped: a statement whose payout column reads zero on a
    // sale the supplier remembers making has to name the difference somewhere.
    expect(line?.reversedPayoutAgorot).toBe(9_000)
  })

  it('applies to a cancelled line too', () => {
    expect(supplierDueAgorot({ ...refundedPhysical, settlementStatus: 'cancelled' })).toBe(0)
  })

  it('still pays a line that was not reversed', () => {
    expect(supplierDueAgorot({ ...refundedPhysical, settlementStatus: 'split_executed' })).toBe(
      9_000,
    )
  })

  it('keeps the reversal out of the balance the supplier is told they are owed', () => {
    const live = sale({
      orderItemId: 'oi-live',
      productType: 'physical',
      faceValueAgorot: 10_000,
      paidOnSiteAgorot: 10_000,
      platformFeeAgorot: 1_000,
      supplierImmediateAgorot: 9_000,
      supplierDueAgorot: 9_000,
      settlementStatus: 'split_executed',
    })
    const balance = summarizeSettlement({ sales: [live, refundedPhysical], redemptions: [] })
    expect(balance.platformOwedAgorot).toBe(9_000)
    expect(balance.reversedAgorot).toBe(9_000)
    // The status breakdown still lists the refunded line, at zero: it happened,
    // and a row that vanishes is a row a supplier asks about.
    expect(balance.byStatus).toContainEqual({
      status: 'refunded',
      count: 1,
      supplierDueAgorot: 0,
    })
  })

  it('keeps it out of the dashboard headline as well', () => {
    expect(
      aggregateDashboard({ sales: [refundedPhysical], redemptions: [] }).supplierDueAgorot,
    ).toBe(0)
  })

  it('totals the reversal alongside the payout', () => {
    const totals = sumPayoutBreakdown(toPayoutBreakdown([refundedPhysical]))
    expect(totals.supplierPayoutAgorot).toBe(0)
    expect(totals.reversedPayoutAgorot).toBe(9_000)
  })
})
