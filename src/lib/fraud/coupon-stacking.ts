/**
 * Coupon stacking rules, stated in one place.
 *
 * THE HARD RULES ARE STRUCTURAL AND ALREADY HELD ELSEWHERE, on purpose:
 *
 * - One code per order. The cart keeps a single coupon cookie, applying a
 *   second code REPLACES the first, and a campaign code shadows a supplier
 *   coupon of the same text (`resolveAppliedCoupon` checks campaigns first).
 * - A discount never exceeds the platform's commission and never pushes the
 *   card charge negative. `calculateSettlement` clamps both, in integers.
 *
 * WHAT IS LEFT IS THE COMBINATION THE CLAMPS PERMIT AND A REVIEWER SHOULD SEE:
 * cashback accrues on the face value of the goods BEFORE the order-level
 * discount and wallet credit come off (settlement.ts computes line cashback
 * from paidOnSite/faceValue, then applies wallet and discount to the order
 * total). So a cart built to be paid mostly by coupon plus wallet still mints
 * full cashback: money out of the platform's pocket for money the card never
 * saw. That is the extraction loop this module detects.
 *
 * DETECTS, NOT BLOCKS. Changing what cashback an order earns is a money-path
 * change; refusing the order punishes legitimate shoppers who saved up wallet
 * credit. The conservative move is to let the order through and put the
 * pattern in front of a human, so the caller enqueues a fraud review item for
 * any violation returned here.
 */

export type CouponStackingFacts = {
  /** The order-level code discount actually applied, in agorot. */
  discountAgorot: number
  /** Wallet credit applied to the order, in agorot. */
  walletAppliedAgorot: number
  /** What the card is actually charged after wallet and discount, in agorot. */
  cardChargeAgorot: number
  /** Cashback the order will mint at finalize, in agorot. */
  cashbackAgorot: number
}

export type CouponStackingViolation =
  /** The order mints more wallet money than the card pays: the extraction loop. */
  | 'cashback-exceeds-card-charge'
  /** A discount code on an order the card never sees at all. */
  | 'discount-with-zero-card-charge'

export function couponStackingViolations(facts: CouponStackingFacts): CouponStackingViolation[] {
  const violations: CouponStackingViolation[] = []
  if (facts.discountAgorot <= 0) return violations

  if (facts.cardChargeAgorot === 0) {
    violations.push('discount-with-zero-card-charge')
  }
  if (facts.cashbackAgorot > 0 && facts.cashbackAgorot > facts.cardChargeAgorot) {
    violations.push('cashback-exceeds-card-charge')
  }
  return violations
}
