import { describe, expect, it } from 'vitest'
import { type SupplierRedemptionRow, type SupplierSaleLine, summarizeSettlement } from './dashboard'

/**
 * The two balances stay apart.
 *
 * The portal page this feeds used to tell owners their coupon share was "held
 * until redemption", which is the escrow model section 0.1 of
 * ARCHITECTURE-SUPPLIER-PORTAL.md abolished. These tests pin the replacement at
 * the arithmetic: a coupon adds to what the shop collected at its own till and
 * adds nothing at all to what the platform will transfer.
 */

function sale(over: Partial<SupplierSaleLine> = {}): SupplierSaleLine {
  return {
    orderItemId: 'item-1',
    orderId: 'order-1',
    productName: 'כיסא',
    productType: 'physical',
    quantity: 1,
    platformPercent: 12,
    faceValueAgorot: 10_000,
    paidOnSiteAgorot: 10_000,
    platformFeeAgorot: 1_200,
    supplierImmediateAgorot: 8_800,
    escrowHeldAgorot: 0,
    escrowReleaseAgorot: 0,
    supplierDueAgorot: 8_800,
    settlementStatus: 'split_executed',
    paidAt: '2026-08-01T09:00:00Z',
    ...over,
  }
}

function redemption(over: Partial<SupplierRedemptionRow> = {}): SupplierRedemptionRow {
  return {
    voucherId: 'v-1',
    code: 'AB12CD34EF',
    productName: 'ארוחה',
    customerName: null,
    remainingAmountDueAgorot: 7_000,
    couponPriceAgorot: 3_000,
    platformPercent: 30,
    redeemedAt: '2026-08-02T12:00:00Z',
    status: 'redeemed',
    ...over,
  }
}

describe('summarizeSettlement', () => {
  it('counts the physical residual as owed by the platform', () => {
    const balance = summarizeSettlement({ sales: [sale()], redemptions: [] })
    expect(balance.platformOwedAgorot).toBe(8_800)
    expect(balance.platformFeeAgorot).toBe(1_200)
  })

  it('puts a redeemed coupon in the till column and nowhere else', () => {
    const balance = summarizeSettlement({ sales: [], redemptions: [redemption()] })
    expect(balance.tillCollectedAgorot).toBe(7_000)
    expect(balance.platformOwedAgorot).toBe(0)
  })

  it('ignores a legacy escrow hold on a coupon line', () => {
    // A real production row: two order_items still carry non-zero escrow
    // columns. Reading them would promise a transfer that will never arrive.
    const couponLine = sale({
      productType: 'coupon',
      supplierImmediateAgorot: 0,
      escrowHeldAgorot: 180_000,
      supplierDueAgorot: 0,
    })
    expect(summarizeSettlement({ sales: [couponLine], redemptions: [] }).platformOwedAgorot).toBe(0)
  })

  it('skips a voucher that has not been redeemed', () => {
    const balance = summarizeSettlement({
      sales: [],
      redemptions: [redemption({ status: 'issued' })],
    })
    expect(balance.tillCollectedAgorot).toBe(0)
  })

  it('groups the history by settlement status, busiest first', () => {
    const balance = summarizeSettlement({
      sales: [
        sale(),
        sale({ orderItemId: 'b' }),
        sale({ orderItemId: 'c', settlementStatus: 'pending', supplierImmediateAgorot: 500 }),
      ],
      redemptions: [],
    })
    expect(balance.byStatus).toEqual([
      { status: 'split_executed', count: 2, supplierDueAgorot: 17_600 },
      { status: 'pending', count: 1, supplierDueAgorot: 500 },
    ])
  })

  it('buckets a null settlement status as pending rather than dropping the line', () => {
    const balance = summarizeSettlement({
      sales: [sale({ settlementStatus: null })],
      redemptions: [],
    })
    expect(balance.byStatus).toEqual([{ status: 'pending', count: 1, supplierDueAgorot: 8_800 }])
  })

  it('is all zeroes for a shop that has sold nothing', () => {
    const balance = summarizeSettlement({ sales: [], redemptions: [] })
    expect(balance.platformOwedAgorot).toBe(0)
    expect(balance.tillCollectedAgorot).toBe(0)
    expect(balance.byStatus).toEqual([])
  })
})
