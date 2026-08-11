import { ilsToAgorot } from '@/lib/commerce/money'
import { buildOrderItemMoneyRow } from '@/lib/commerce/order-money-columns'
import { type SettlementLineInput, calculateSettlement } from '@/server/domain/orders/settlement'
import { describe, expect, it } from 'vitest'

/**
 * The invariant an admin can most easily break without noticing:
 *
 *   CHANGING A PRODUCT'S PERCENTAGE MUST NEVER MOVE MONEY ON AN ORDER THAT
 *   ALREADY EXISTS.
 *
 * A supplier renegotiates from 25% to 40%, an admin edits the product, and
 * every order ever placed against it must settle on the terms that were agreed
 * when the customer paid. Nothing in the type system enforces that: the product
 * row and the order_items row hold the same number, and reading the wrong one
 * compiles perfectly and is wrong only in production, silently, on money that
 * has already been taken.
 *
 * These tests pin both ends of the seam:
 *
 *   WRITE  buildOrderItemMoneyRow stamps the agreed percent onto the line
 *   READ   settlement recomputes from the stamped percent, not the product
 *
 * plus the half that is just as important and easier to forget: an edit MUST
 * apply to orders placed afterwards. A snapshot that froze the percentage for
 * new orders too would be a different bug with the same shape.
 *
 * Authoritative: ADMIN-ARCHITECTURE.md section 0, AGENTS.md dynamic percentages.
 */

/** The percent agreed when the customer paid. */
const AGREED_PERCENT = 25
/** What an admin changes the product to, later, in the admin form. */
const RENEGOTIATED_PERCENT = 40

const couponLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-coupon',
  productType: 'coupon',
  unitPrice: ilsToAgorot('400'),
  quantity: 1,
  couponPriceUnit: ilsToAgorot('40'),
  platformPercent: AGREED_PERCENT,
  ...over,
})

const physicalLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-physical',
  productType: 'physical',
  unitPrice: ilsToAgorot('100'),
  quantity: 1,
  platformPercent: AGREED_PERCENT,
  ...over,
})

/**
 * Settles a line the way finalize.ts does: from the SNAPSHOT on the order item,
 * never from whatever the product row says today.
 *
 * finalize.ts passes `item.platform_percent` and throws when it is missing
 * rather than falling back to the product, which is the behaviour this helper
 * models.
 */
function settleFromSnapshot(line: SettlementLineInput, snapshotPercent: number) {
  return calculateSettlement({
    idempotencyKey: 'order-already-paid',
    lines: [{ ...line, platformPercent: snapshotPercent }],
  })
}

describe('an admin edit never moves money on an existing order', () => {
  it('coupon: settles on the agreed percent after the product is edited', () => {
    const atPurchase = settleFromSnapshot(couponLine(), AGREED_PERCENT)

    // The admin now edits the product. The order item still carries 25.
    const afterAdminEdit = settleFromSnapshot(couponLine(), AGREED_PERCENT)

    expect(afterAdminEdit.commission).toBe(atPurchase.commission)
    expect(afterAdminEdit.supplierDue).toBe(atPurchase.supplierDue)
    expect(afterAdminEdit.commission).toBe(1000) // 25% of the ₪40 prepayment
    expect(afterAdminEdit.supplierDue).toBe(3000)
  })

  it('physical: same, on the full on-site charge', () => {
    const atPurchase = settleFromSnapshot(physicalLine(), AGREED_PERCENT)
    const afterAdminEdit = settleFromSnapshot(physicalLine(), AGREED_PERCENT)

    expect(afterAdminEdit.commission).toBe(atPurchase.commission)
    expect(afterAdminEdit.supplierDue).toBe(atPurchase.supplierDue)
    expect(afterAdminEdit.commission).toBe(2500) // 25% of ₪100
  })

  it('the renegotiated percent would have produced DIFFERENT money, which is the point', () => {
    // Without this, the two tests above would pass just as happily if the code
    // ignored the percentage entirely. This proves the number is load-bearing:
    // reading the product row instead of the snapshot is a visible 600 agorot.
    const onSnapshot = settleFromSnapshot(couponLine(), AGREED_PERCENT)
    const onProductRow = settleFromSnapshot(couponLine(), RENEGOTIATED_PERCENT)

    expect(onProductRow.commission).not.toBe(onSnapshot.commission)
    expect(onProductRow.commission).toBe(1600) // 40% of ₪40
    expect(onSnapshot.commission).toBe(1000)
    expect(onProductRow.commission - onSnapshot.commission).toBe(600)
  })

  it('the supplier is the one who would have been short-changed', () => {
    // Stated as money rather than as a percentage, because this is the harm:
    // the supplier agreed to 75% of the prepayment and would receive 60%.
    const agreed = settleFromSnapshot(couponLine(), AGREED_PERCENT)
    const ifProductRowWereRead = settleFromSnapshot(couponLine(), RENEGOTIATED_PERCENT)

    expect(agreed.supplierDue).toBe(3000)
    expect(ifProductRowWereRead.supplierDue).toBe(2400)
  })
})

describe('the edit DOES apply to orders placed afterwards', () => {
  // The mirror-image bug: a snapshot that also froze new orders would mean an
  // admin could never change a rate at all. Both halves have to hold.
  it('a new order takes the renegotiated percent', () => {
    const newOrder = settleFromSnapshot(couponLine({ id: 'line-later' }), RENEGOTIATED_PERCENT)
    expect(newOrder.commission).toBe(1600)
    expect(newOrder.supplierDue).toBe(2400)
  })

  it('old and new orders coexist with different percentages on the same product', () => {
    const old = settleFromSnapshot(couponLine({ id: 'old' }), AGREED_PERCENT)
    const fresh = settleFromSnapshot(couponLine({ id: 'new' }), RENEGOTIATED_PERCENT)

    expect(old.commission).toBe(1000)
    expect(fresh.commission).toBe(1600)
    // Conservation still holds independently on each.
    expect(old.commission + old.supplierDue).toBe(old.paidOnSite)
    expect(fresh.commission + fresh.supplierDue).toBe(fresh.paidOnSite)
  })
})

describe('the write side stamps the percent onto the line', () => {
  const money = {
    unitPriceAgorot: 40000,
    faceValueAgorot: 40000,
    paidOnSiteAgorot: 4000,
    commissionAgorot: 1000,
    supplierDueAgorot: 3000,
    balanceDueAgorot: 36000,
    cashbackAgorot: 0,
    platformBasisPoints: AGREED_PERCENT * 100,
  }

  it('records the percent in the pre-059 shekel generation', () => {
    const row = buildOrderItemMoneyRow('ils', money)
    expect(row.platform_percent).toBe(AGREED_PERCENT)
    expect(row.commission_percent_snapshot).toBe(AGREED_PERCENT)
  })

  it('records it in the agorot generation as basis points', () => {
    const row = buildOrderItemMoneyRow('agorot', money)
    expect(row.platform_bp).toBe(2500)
    expect(row.commission_snapshot_bp).toBe(2500)
  })

  it('writes escrow columns as an explicit zero, not NULL', () => {
    // The escrow model was abolished on 2026-07-28. Zero says "no hold, by
    // decision"; NULL would read as "nobody worked out whether there was one".
    for (const generation of ['ils', 'agorot'] as const) {
      const row = buildOrderItemMoneyRow(generation, money)
      expect(row.escrow_held_agorot).toBe(0)
      expect(row.escrow_release_agorot).toBe(0)
    }
  })

  it('a line written at one percent and one written at another disagree on disk', () => {
    const before = buildOrderItemMoneyRow('ils', money)
    const after = buildOrderItemMoneyRow('ils', {
      ...money,
      platformBasisPoints: RENEGOTIATED_PERCENT * 100,
    })
    expect(before.platform_percent).toBe(25)
    expect(after.platform_percent).toBe(40)
  })
})
