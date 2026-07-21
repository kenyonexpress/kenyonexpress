import { issueCouponCode } from '@/lib/checkout/coupon-issue'
import type { SplitResultView } from '@/lib/checkout/split'

export type FinalizableOrderLine = {
  orderItemId: string
  productId: string
  supplierId: string
  productType: 'coupon' | 'physical'
  quantity: number
  couponExpiryDays: number
  unitPriceIls: number
  chargedOnSiteIls: number
  platformFeeIls: number
  supplierDueIls: number
  balanceDueAtBusinessIls: number
  platformPercent: number
  cashbackAmountIls: number
}

export type FinalizePlan = {
  orderId: string
  userId: string
  paymentId: string
  cardChargeIls: number
  walletAppliedIls: number
  cashbackEarnIls: number
  coupons: Array<{
    orderItemId: string
    productId: string
    supplierId: string
    code: string
    qrPayload: string
    expiresAt: string
  }>
  stockDecrements: Array<{ productId: string; quantity: number }>
  physicalLines: string[]
  saveCard: boolean
}

/**
 * Pure planner for checkout_finalize side effects.
 * Persistence / wallet RPCs / notifications are executed by the caller.
 */
export function planFinalizePaidOrder(input: {
  orderId: string
  userId: string
  paymentId: string
  split: SplitResultView
  lines: FinalizableOrderLine[]
  saveCard: boolean
  now?: Date
}): FinalizePlan {
  const coupons: FinalizePlan['coupons'] = []
  const stockDecrements: FinalizePlan['stockDecrements'] = []
  const physicalLines: string[] = []

  for (const line of input.lines) {
    if (line.productType === 'coupon') {
      for (let i = 0; i < line.quantity; i += 1) {
        const issued = issueCouponCode({
          orderItemId: line.orderItemId,
          userId: input.userId,
          expiryDays: line.couponExpiryDays,
          now: input.now,
        })
        coupons.push({
          orderItemId: line.orderItemId,
          productId: line.productId,
          supplierId: line.supplierId,
          code: issued.code,
          qrPayload: issued.qrPayload,
          expiresAt: issued.expiresAt.toISOString(),
        })
      }
    } else {
      physicalLines.push(line.orderItemId)
      stockDecrements.push({ productId: line.productId, quantity: line.quantity })
    }
  }

  return {
    orderId: input.orderId,
    userId: input.userId,
    paymentId: input.paymentId,
    cardChargeIls: input.split.cardChargeIls,
    walletAppliedIls: input.split.walletAppliedIls,
    cashbackEarnIls: input.split.cashbackAmountIls,
    coupons,
    stockDecrements,
    physicalLines,
    saveCard: input.saveCard,
  }
}
