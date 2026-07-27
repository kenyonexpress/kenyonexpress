import {
  type CommissionInput,
  type CommissionResult,
  calculateCommission,
} from '@/lib/commerce/commission'
import { agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import type { CalculateSplitInput } from '@/lib/validations/checkout'

export type SplitLineView = {
  id: string
  productType: 'coupon' | 'physical'
  quantity: number
  faceValueIls: number
  customerPaysNowIls: number
  balanceDueAtBusinessIls: number
  platformPercent: number
  platformFeeIls: number
  /** Physical: transferred with the settlement. Zero on coupons. */
  supplierImmediateIls: number
  /** Coupon: held internally, released to the supplier at redemption. */
  escrowHeldIls: number
  supplierDueIls: number
  cashbackPercent: number
  cashbackAmountIls: number
}

export type SplitResultView = {
  idempotencyKey: string
  lines: SplitLineView[]
  faceValueIls: number
  customerPaysNowIls: number
  balanceDueAtBusinessIls: number
  platformFeeIls: number
  supplierImmediateIls: number
  escrowHeldIls: number
  supplierDueIls: number
  cashbackAmountIls: number
  walletAppliedIls: number
  cardChargeIls: number
}

/**
 * Wire-facing split calculator (model of 2026-07-27).
 * Coupon: customer pays the admin-set ABSOLUTE coupon price on site (mandatory
 * per product, no default and no percent derivation), remainder at the
 * business. The platform keeps platform_percent OF THAT PREPAYMENT and the
 * rest is held for the supplier until redemption.
 * Physical: customer pays 100% on site; platform_percent splits it immediately.
 *
 * platform_percent is mandatory on both types. It used to be forced to 0 for
 * coupons here, which was correct only while the platform kept the whole
 * prepayment; passing 0 now would silently pay the supplier the entire
 * prepayment and the platform nothing.
 */
export function calculateSplit(input: CalculateSplitInput): SplitResultView {
  const commissionInput: CommissionInput = {
    idempotencyKey: input.idempotencyKey,
    walletApplied: ilsToAgorot(input.walletAppliedIls.toFixed(2)),
    lines: input.lines.map((line) => ({
      id: line.id,
      productType: line.productType,
      unitPrice: ilsToAgorot(line.unitPriceIls.toFixed(2)),
      quantity: line.quantity,
      platformPercent: line.platformPercent ?? null,
      couponPriceUnit:
        line.couponPriceIls !== undefined ? ilsToAgorot(line.couponPriceIls.toFixed(2)) : undefined,
      cashbackPercent: line.cashbackPercent,
    })),
  }

  return toSplitView(calculateCommission(commissionInput))
}

export function toSplitView(result: CommissionResult): SplitResultView {
  return {
    idempotencyKey: result.idempotencyKey,
    lines: result.lines.map((line) => ({
      id: line.id,
      productType: line.productType,
      quantity: line.quantity,
      faceValueIls: agorotToIls(line.faceValue),
      customerPaysNowIls: agorotToIls(line.customerPaysNow),
      balanceDueAtBusinessIls: agorotToIls(line.balanceDueAtBusiness),
      platformPercent: line.platformPercentBps / 100,
      platformFeeIls: agorotToIls(line.platformFee),
      supplierImmediateIls: agorotToIls(line.supplierImmediate),
      escrowHeldIls: agorotToIls(line.escrowHeld),
      supplierDueIls: agorotToIls(line.supplierDue),
      cashbackPercent: line.cashbackPercentBps / 100,
      cashbackAmountIls: agorotToIls(line.cashbackAmount),
    })),
    faceValueIls: agorotToIls(result.faceValue),
    customerPaysNowIls: agorotToIls(result.customerPaysNow),
    balanceDueAtBusinessIls: agorotToIls(result.balanceDueAtBusiness),
    platformFeeIls: agorotToIls(result.platformFee),
    supplierImmediateIls: agorotToIls(result.supplierImmediate),
    escrowHeldIls: agorotToIls(result.escrowHeld),
    supplierDueIls: agorotToIls(result.supplierDue),
    cashbackAmountIls: agorotToIls(result.cashbackAmount),
    walletAppliedIls: agorotToIls(result.walletApplied),
    cardChargeIls: agorotToIls(result.cardCharge),
  }
}
