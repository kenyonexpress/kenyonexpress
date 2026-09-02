/**
 * Cashback engine (pure functions, no IO).
 *
 * Rules:
 *  - 10% cashback on the customer's first purchase.
 *  - 5% cashback on every fifth purchase (5th, 10th, 15th, ...).
 *  - Every other purchase earns no cashback.
 *
 * All amounts are integer agorot (ILS minor unit) and all rates are integer
 * basis points, per D-MONEY-1 / D-PERCENT. Every calculation goes through
 * `src/lib/money.ts`, so no float ever touches a money value.
 */

import { type Agorot, type Bp, applyBp, bp } from '../money'

/** Rate for the first purchase: 10% = 1000 bp. */
export const FIRST_PURCHASE_CASHBACK_BP: Bp = bp(1000)

/** Rate for every fifth purchase: 5% = 500 bp. */
export const EVERY_FIFTH_PURCHASE_CASHBACK_BP: Bp = bp(500)

/** Rate for all other purchases: 0 bp. */
export const NO_CASHBACK_BP: Bp = bp(0)

function assertPurchaseNumber(purchaseNumber: number): void {
  if (!Number.isSafeInteger(purchaseNumber) || purchaseNumber < 1) {
    throw new RangeError(
      `purchaseNumber must be a positive integer, 1-based (got ${purchaseNumber})`,
    )
  }
}

/**
 * The cashback rate, in basis points, for the customer's Nth purchase
 * (1-based). The first purchase wins over the "every fifth" rule by
 * construction, since 1 is not a multiple of 5.
 */
export function cashbackRateBp(purchaseNumber: number): Bp {
  assertPurchaseNumber(purchaseNumber)
  if (purchaseNumber === 1) {
    return FIRST_PURCHASE_CASHBACK_BP
  }
  if (purchaseNumber % 5 === 0) {
    return EVERY_FIFTH_PURCHASE_CASHBACK_BP
  }
  return NO_CASHBACK_BP
}

/**
 * Cashback earned for the customer's Nth purchase (1-based) of `amount`
 * agorot. Rounding is integer half-up via `applyBp`, so results are
 * deterministic. Negative amounts are rejected: cashback is only defined
 * over a non-negative purchase total.
 */
export function cashbackForPurchase(purchaseNumber: number, amount: Agorot): Agorot {
  if (amount < 0) {
    throw new RangeError(`amount must be non-negative agorot (got ${amount})`)
  }
  return applyBp(amount, cashbackRateBp(purchaseNumber))
}
