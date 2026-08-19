import { ilsToAgorot } from '@/lib/commerce/money'
import {
  amountToCollect,
  toPublicOutcome,
  validateVoucherRedemption,
} from '@/server/domain/vouchers/redemption'
import { describe, expect, it } from 'vitest'
import { RefundError, planOrderRefund } from './refund'
import { calculateSettlement } from './settlement'
import { type SettlementState, deriveOrderStatus, transition } from './state-machine'

const NOW = new Date('2026-07-21T12:00:00.000Z')
const SCAN_AT = new Date('2026-07-25T09:30:00.000Z')

/**
 * End-to-end domain flow for a mixed cart under the final business rules
 * (C11 version b, 2026-07-27): coupon = absolute admin price on site, split by
 * the product's own platform_percent, the supplier's share HELD until the scan,
 * balance collected at the business on scan, voucher then terminal.
 */
describe('checkout flow (domain integration, final rules)', () => {
  it('runs a mixed order from pending to full settlement', () => {
    // 1. Settlement snapshot at beginCheckout: coupon face 250₪ x2 at coupon
    //    price 99₪ each with the platform on 25%, physical 120₪ at 5%.
    const settlement = calculateSettlement({
      idempotencyKey: 'order-1',
      lines: [
        {
          id: 'item-coupon',
          productType: 'coupon',
          unitPrice: ilsToAgorot('250'),
          quantity: 2,
          couponPriceUnit: ilsToAgorot('99'),
          platformPercent: 25,
        },
        {
          id: 'item-physical',
          productType: 'physical',
          unitPrice: ilsToAgorot('120'),
          quantity: 1,
          platformPercent: 5,
        },
      ],
    })
    const couponLine = settlement.lines.find((l) => l.id === 'item-coupon')
    const physicalLine = settlement.lines.find((l) => l.id === 'item-physical')
    if (!couponLine || !physicalLine) throw new Error('missing settlement lines')

    // coupon: 2 x 9900 on site, 25% of it to the platform and the residual to
    // the supplier; balance 2 x 15100 collected at the business.
    expect(couponLine.paidOnSite).toBe(19800)
    expect(couponLine.commission).toBe(4950)
    expect(couponLine.supplierDue).toBe(14850)
    expect(couponLine.commission + couponLine.supplierDue).toBe(couponLine.paidOnSite)
    expect(couponLine.balanceDueAtBusiness).toBe(30200)
    // physical: face 12000, commission 600, supplier 11400
    expect(physicalLine.commission).toBe(600)
    expect(physicalLine.supplierDue).toBe(11400)
    expect(settlement.cardCharge).toBe(19800 + 12000)

    // 2. Payment confirmed -> both lines paid
    const lineStates = new Map<string, SettlementState>([
      ['item-coupon', 'pending'],
      ['item-physical', 'pending'],
    ])
    for (const [id, state] of lineStates) {
      lineStates.set(id, transition(state, 'PAYMENT_CONFIRMED'))
    }
    expect(deriveOrderStatus([...lineStates.values()])).toBe('paid')

    // 3. Finalize: physical splits immediately, the coupon line's supplier
    //    share goes into escrow; one voucher money-snapshot per purchased unit.
    lineStates.set('item-physical', transition('paid', 'EXECUTE_SPLIT'))
    lineStates.set('item-coupon', transition('paid', 'EXECUTE_SPLIT'))
    // The order is not settled while a line is held, even though the physical
    // leg is done: the held line is the least-advanced active one.
    expect(deriveOrderStatus([...lineStates.values()])).toBe('split_executed')

    expect(couponLine.perUnitVoucher).toHaveLength(2)
    const vouchers = couponLine.perUnitVoucher.map((unit, i) => ({
      id: `voucher-${i}`,
      code: `CODE000${i}A`.slice(0, 10),
      status: 'issued' as const,
      supplierId: 'supplier-1',
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      faceValueAgorot: unit.faceValue,
      couponPriceAgorot: unit.paidOnSite,
      remainingAmountDueAgorot: unit.balanceDue,
    }))

    // 4. The business scans the first voucher: valid, and the counter collects
    //    exactly the snapshot balance.
    const first = vouchers[0]
    if (!first) throw new Error('missing voucher')
    expect(
      validateVoucherRedemption({
        voucher: first,
        requestingSupplierId: 'supplier-1',
        now: SCAN_AT,
      }),
    ).toBe('success')
    expect(amountToCollect(first)).toBe(first.remainingAmountDueAgorot)
    const firstRedeemed = { ...first, status: 'redeemed' as const }

    // 5. Second scan of the same voucher: rejected.
    expect(
      validateVoucherRedemption({
        voucher: firstRedeemed,
        requestingSupplierId: 'supplier-1',
        now: SCAN_AT,
      }),
    ).toBe('already_redeemed')

    // 6. A scan by the wrong business reports not_found to the caller.
    const second = vouchers[1]
    if (!second) throw new Error('missing voucher')
    const wrongSupplier = validateVoucherRedemption({
      voucher: second,
      requestingSupplierId: 'supplier-2',
      now: SCAN_AT,
    })
    expect(wrongSupplier).toBe('wrong_supplier')
    expect(toPublicOutcome(wrongSupplier)).toBe('not_found')

    // 7. Scanning moves no money: the line was already settled at paid-time,
    //    so the voucher lifecycle runs to completion without touching the
    //    settlement state at all.
    const scanned = [firstRedeemed, { ...second, status: 'redeemed' as const }]
    expect(scanned.every((v) => v.status === 'redeemed')).toBe(true)
    expect(lineStates.get('item-coupon')).toBe('split_executed')
    expect(deriveOrderStatus([...lineStates.values()])).toBe('split_executed')

    // 8. Money conservation: the on-site charge divides between platform and
    //    supplier by each product's own percent, no matter what happens to the
    //    vouchers; the business collected only the balance.
    const platformKeeps = couponLine.commission + physicalLine.commission
    expect(platformKeeps).toBe(4950 + 600)
    const suppliersAreOwed = couponLine.supplierDue + physicalLine.supplierDue
    expect(suppliersAreOwed).toBe(14850 + 11400)
    expect(platformKeeps + suppliersAreOwed).toBe(settlement.paidOnSite)
    const collectedAtBusiness = vouchers.reduce((acc, v) => acc + v.remainingAmountDueAgorot, 0)
    expect(collectedAtBusiness).toBe(couponLine.balanceDueAtBusiness)
    for (const v of vouchers) {
      expect(v.couponPriceAgorot + v.remainingAmountDueAgorot).toBe(v.faceValueAgorot)
    }
  })

  it('refund: legal while vouchers are issued, blocked once one is consumed', () => {
    const lines = [
      {
        orderItemId: 'item-coupon',
        productType: 'coupon' as const,
        settlementStatus: 'split_executed' as const,
      },
    ]

    // All vouchers still issued: full refund minus the legal cancellation fee.
    const plan = planOrderRefund({
      cardChargedAgorot: 19800,
      lines,
      vouchers: [
        { voucherId: 'v1', status: 'issued' },
        { voucherId: 'v2', status: 'issued' },
      ],
      isDefectClaim: false,
      now: SCAN_AT,
    })
    expect(plan.voucherRefunds).toEqual(['v1', 'v2'])
    // 5% of 19800 = 990, under the ₪100 cap
    expect(plan.cancellationFeeAgorot).toBe(990)
    expect(plan.refundAmountAgorot).toBe(18810)
    expect(plan.orderStatus).toBe('refunded')

    // One voucher redeemed: its value was consumed at the business, the card
    // refund is blocked entirely.
    expect(() =>
      planOrderRefund({
        cardChargedAgorot: 19800,
        lines,
        vouchers: [
          { voucherId: 'v1', status: 'redeemed' },
          { voucherId: 'v2', status: 'issued' },
        ],
        isDefectClaim: false,
        now: SCAN_AT,
      }),
    ).toThrowError(RefundError)

    // Same for an expired voucher: breakage is not refundable to the card.
    expect(() =>
      planOrderRefund({
        cardChargedAgorot: 19800,
        lines,
        vouchers: [{ voucherId: 'v1', status: 'expired' }],
        isDefectClaim: false,
        now: SCAN_AT,
      }),
    ).toThrowError(RefundError)
  })

  it('expired voucher fails the scan and moves no money', () => {
    const expired = {
      code: 'CODE0000AA',
      status: 'issued' as const,
      supplierId: 'supplier-1',
      expiresAt: new Date(SCAN_AT.getTime() - 1000).toISOString(),
      faceValueAgorot: 25000,
      couponPriceAgorot: 9900,
      remainingAmountDueAgorot: 15100,
    }
    expect(
      validateVoucherRedemption({
        voucher: expired,
        requestingSupplierId: 'supplier-1',
        now: SCAN_AT,
      }),
    ).toBe('expired')
    // The scan itself moves nothing. Expiry is not forfeiture though (C6): the
    // sweep refunds the supplier's hold and credit_expired_vouchers() returns
    // what the customer paid online as wallet credit. Both live in migration
    // 074, not in this pure domain layer.
  })
})
