import { issueCouponCode } from '@/lib/checkout/coupon-issue'
import { ilsToAgorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { type EscrowHold, createEscrowHold, refundEscrow, releaseEscrow } from './escrow'
import { type RedeemableCoupon, validateRedemption, verifyQrPayload } from './redemption'
import { calculateSettlement } from './settlement'
import { type SettlementState, deriveOrderStatus, transition } from './state-machine'

const NOW = new Date('2026-07-21T12:00:00.000Z')
const SCAN_AT = new Date('2026-07-25T09:30:00.000Z')

/**
 * End-to-end domain flow for a mixed cart: one coupon (2 units) + one physical
 * line. Simulates payment finalize, physical split, double scan, and escrow
 * release exactly once.
 */
describe('checkout flow (domain integration)', () => {
  it('runs a mixed order from pending to full settlement', () => {
    // 1. Settlement snapshot at beginCheckout
    const settlement = calculateSettlement({
      idempotencyKey: 'order-1',
      lines: [
        {
          id: 'item-coupon',
          productType: 'coupon',
          unitPrice: ilsToAgorot('250'),
          quantity: 2,
          upfrontPercent: 10,
          commissionPercent: 5,
        },
        {
          id: 'item-physical',
          productType: 'physical',
          unitPrice: ilsToAgorot('120'),
          quantity: 1,
          commissionPercent: 5,
        },
      ],
    })
    const couponLine = settlement.lines.find((l) => l.id === 'item-coupon')
    const physicalLine = settlement.lines.find((l) => l.id === 'item-physical')
    if (!couponLine || !physicalLine) throw new Error('missing settlement lines')

    // coupon: face 50000, upfront 5000 to escrow, commission 250, release 4750
    expect(couponLine.escrowHeld).toBe(5000)
    expect(couponLine.commission).toBe(250)
    expect(couponLine.escrowReleaseToSupplier).toBe(4750)
    // physical: face 12000, commission 600, supplier 11400
    expect(physicalLine.supplierImmediate).toBe(11400)
    expect(settlement.cardCharge).toBe(5000 + 12000)

    // 2. Payment confirmed -> both lines paid
    const lineStates = new Map<string, SettlementState>([
      ['item-coupon', 'pending'],
      ['item-physical', 'pending'],
    ])
    for (const [id, state] of lineStates) {
      lineStates.set(
        id,
        transition(state, 'PAYMENT_CONFIRMED', id === 'item-coupon' ? 'coupon' : 'physical'),
      )
    }
    expect(deriveOrderStatus([...lineStates.values()])).toBe('paid')

    // 3. Finalize: physical splits immediately, coupon escrow held per unit
    lineStates.set('item-physical', transition('paid', 'EXECUTE_SPLIT', 'physical'))
    lineStates.set('item-coupon', transition('paid', 'HOLD_ESCROW', 'coupon'))

    const issued = couponLine.perUnitEscrow.map((unit, i) => {
      const code = issueCouponCode({
        orderItemId: 'item-coupon',
        userId: 'user-1',
        expiryDays: 30,
        now: NOW,
      })
      return {
        couponCodeId: `code-${i}`,
        code,
        hold: createEscrowHold({
          couponCodeId: `code-${i}`,
          orderId: 'order-1',
          orderItemId: 'item-coupon',
          supplierId: 'supplier-1',
          heldAgorot: unit.held,
          commissionAgorot: unit.commission,
          now: NOW,
        }),
      }
    })
    expect(issued).toHaveLength(2)
    const totalHeld = issued.reduce((acc, u) => acc + u.hold.heldAgorot, 0)
    expect(totalHeld).toBe(couponLine.escrowHeld)
    expect(deriveOrderStatus([...lineStates.values()])).toBe('escrow_held')

    // 4. Supplier scans the first voucher: QR verifies, single use enforced
    const first = issued[0]
    if (!first) throw new Error('missing issued voucher')
    const qr = verifyQrPayload(first.code.qrPayload)
    expect(qr?.code).toBe(first.code.code)

    let couponRow: RedeemableCoupon = {
      code: first.code.code,
      status: 'issued',
      supplierId: 'supplier-1',
      expiresAt: first.code.expiresAt.toISOString(),
    }
    expect(
      validateRedemption({ coupon: couponRow, requestingSupplierId: 'supplier-1', now: SCAN_AT }),
    ).toBe('success')
    couponRow = { ...couponRow, status: 'used' }

    // escrow releases exactly once, keyed by the coupon code
    const releaseKey = `rel:${first.couponCodeId}`
    const release = releaseEscrow(first.hold, releaseKey, SCAN_AT)
    expect(release.transferredAgorot).toBe(first.hold.releaseAgorot)

    // 5. Second scan of the same voucher: rejected, and escrow replay moves nothing
    expect(
      validateRedemption({ coupon: couponRow, requestingSupplierId: 'supplier-1', now: SCAN_AT }),
    ).toBe('already_used')
    const replay = releaseEscrow(release.hold, releaseKey, SCAN_AT)
    expect(replay.replay).toBe(true)
    expect(replay.transferredAgorot).toBe(0)

    // 6. Order remains escrow_held until every voucher is redeemed
    expect(deriveOrderStatus([...lineStates.values()])).toBe('escrow_held')

    // 7. Second voucher redeemed -> line redeemed -> escrow released -> order settled
    const second = issued[1]
    if (!second) throw new Error('missing issued voucher')
    releaseEscrow(second.hold, `rel:${second.couponCodeId}`, SCAN_AT)
    lineStates.set('item-coupon', transition('escrow_held', 'REDEEM', 'coupon'))
    lineStates.set('item-coupon', transition('redeemed', 'RELEASE_ESCROW', 'coupon'))
    expect(deriveOrderStatus([...lineStates.values()])).toBe('escrow_released')

    // 8. Money conservation across the whole order
    const releasedToSupplier = issued.reduce((acc, u) => acc + u.hold.releaseAgorot, 0)
    const commissionKept = issued.reduce((acc, u) => acc + u.hold.commissionAgorot, 0)
    expect(releasedToSupplier + commissionKept).toBe(couponLine.escrowHeld)
    expect(physicalLine.commission + physicalLine.supplierImmediate).toBe(physicalLine.faceValue)
  })

  it('expired voucher cannot release escrow; refund path returns the full hold', () => {
    const code = issueCouponCode({
      orderItemId: 'item-1',
      userId: 'user-1',
      expiryDays: 1,
      now: NOW,
    })
    const afterExpiry = new Date(code.expiresAt.getTime() + 1000)
    const couponRow: RedeemableCoupon = {
      code: code.code,
      status: 'issued',
      supplierId: 'supplier-1',
      expiresAt: code.expiresAt.toISOString(),
    }
    expect(
      validateRedemption({
        coupon: couponRow,
        requestingSupplierId: 'supplier-1',
        now: afterExpiry,
      }),
    ).toBe('expired')

    const hold: EscrowHold = createEscrowHold({
      couponCodeId: 'code-x',
      orderId: 'order-x',
      orderItemId: 'item-1',
      supplierId: 'supplier-1',
      heldAgorot: ilsToAgorot('25'),
      commissionAgorot: ilsToAgorot('1.25'),
      now: NOW,
    })
    // expiry cron refunds the customer instead of releasing to the supplier
    const { refundedAgorot } = refundEscrow(hold, afterExpiry)
    expect(refundedAgorot).toBe(2500)
  })
})
