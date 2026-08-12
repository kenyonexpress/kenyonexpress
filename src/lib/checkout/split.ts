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
  /** Immediate supplier share of the on-site charge (residual of platformFee). */
  supplierImmediateIls: number
  /** Same as supplierImmediate under ADMIN §0 (no escrow). */
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
  supplierDueIls: number
  cashbackAmountIls: number
  walletAppliedIls: number
  cardChargeIls: number
}

/**
 * Wire-facing split calculator (ADMIN-ARCHITECTURE §0).
 * Coupon: customer pays the admin-set ABSOLUTE coupon price on site (mandatory
 * per product, no default and no percent derivation), remainder at the
 * business. The platform keeps platform_percent OF THAT PREPAYMENT and the
 * residual settles to the supplier immediately. No escrow.
 * Physical: customer pays the on-site charge (after discount_percent); the same
 * pair splits it immediately.
 *
 * platform_percent is mandatory on both types.
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
      supplierDueIls: agorotToIls(line.supplierDue),
      cashbackPercent: line.cashbackPercentBps / 100,
      cashbackAmountIls: agorotToIls(line.cashbackAmount),
    })),
    faceValueIls: agorotToIls(result.faceValue),
    customerPaysNowIls: agorotToIls(result.customerPaysNow),
    balanceDueAtBusinessIls: agorotToIls(result.balanceDueAtBusiness),
    platformFeeIls: agorotToIls(result.platformFee),
    supplierImmediateIls: agorotToIls(result.supplierImmediate),
    supplierDueIls: agorotToIls(result.supplierDue),
    cashbackAmountIls: agorotToIls(result.cashbackAmount),
    walletAppliedIls: agorotToIls(result.walletApplied),
    cardChargeIls: agorotToIls(result.cardCharge),
  }
}
