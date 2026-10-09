import { type Agorot, type Bp, applyBp, bp } from '@/lib/money'

/**
 * The order-count cashback rules, mirrored for display only.
 *
 * THE DATABASE DECIDES. `fn_cashback_order_bonus` (migration 177) owns the
 * rule: it takes the per-user lock, counts finalized orders, moves the money
 * and writes the ledger row. This module exists so the UI can say "your next
 * order earns 5%" and so a unit test can pin the arithmetic; it never awards
 * anything. `rules.test.ts` reads the migration file and fails if these
 * numbers drift from the SQL.
 */

/** First finalized purchase: 10% of the order total. */
export const FIRST_PURCHASE_BONUS_BP = 1000

/** Every fifth finalized purchase (5, 10, 15, ...): 5% of the order total. */
export const FIFTH_PURCHASE_BONUS_BP = 500

/**
 * The bonus rate for a purchase at 1-based rank `purchaseRank` in the user's
 * finalized-order history. Rank 1 earns the first-purchase rate and never
 * double-fires with the every-fifth rule; ranks 5, 10, 15, ... earn the fifth
 * rate; everything else earns nothing.
 */
export function orderCountBonusBp(purchaseRank: number): Bp {
  if (!Number.isSafeInteger(purchaseRank) || purchaseRank < 1) {
    throw new RangeError(`purchase rank must be a positive integer (got ${purchaseRank})`)
  }
  if (purchaseRank === 1) return bp(FIRST_PURCHASE_BONUS_BP)
  if (purchaseRank % 5 === 0) return bp(FIFTH_PURCHASE_BONUS_BP)
  return bp(0)
}

/**
 * The agorot a purchase of `totalAgorot` at rank `purchaseRank` earns.
 * Integer half-up via applyBp, the same ×2 trick the SQL performs with
 * `(basis * bp + 5000) / 10000`.
 */
export function orderCountBonusAgorot(totalAgorot: Agorot, purchaseRank: number): Agorot {
  return applyBp(totalAgorot, orderCountBonusBp(purchaseRank))
}
