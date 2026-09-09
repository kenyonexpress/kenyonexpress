import { type Agorot, agorot } from '@/lib/money'

/**
 * The cashback expiry rule, mirrored for display only.
 *
 * THE DATABASE DECIDES. `fn_cashback_expire` (migration 215) owns the rule: it
 * takes the per-user lock, reads both sides off `wallet_entries`, moves the
 * money back to the reserve and writes the negative ledger row. This module
 * exists so the UI can say "the cashback from your first order lapses on
 * <date>" and so a unit test can pin the arithmetic; it never expires
 * anything. `expiry.test.ts` reads the migration file and fails if these
 * numbers drift from the SQL.
 */

/** A cashback credit lapses this many months after it landed in the wallet. */
export const CASHBACK_LIFETIME_MONTHS = 12

/**
 * The day a credit earned at `earnedAt` stops being spendable, for display.
 * The SQL compares `created_at <= now() - interval '12 months'`, so the credit
 * survives through this instant and expires on the first sweep after it.
 */
export function cashbackExpiresAt(earnedAt: Date): Date {
  const expires = new Date(earnedAt)
  expires.setMonth(expires.getMonth() + CASHBACK_LIFETIME_MONTHS)
  return expires
}

/**
 * The agorot a sweep would expire for a user, given the three sums the SQL
 * reads: cashback credits older than the cutoff, every debit the wallet ever
 * made (spends, clawbacks and earlier expiries alike), and the account's live
 * balance. Debits consume the oldest cashback first — the customer-favourable
 * reading — and the result never exceeds the balance, so an expiry can never
 * drive a wallet negative.
 */
export function expirableCashbackAgorot(
  expiredCredits: Agorot,
  totalDebits: Agorot,
  balance: Agorot,
): Agorot {
  if (expiredCredits < 0 || totalDebits < 0) {
    throw new RangeError(
      `credit and debit sums must be non-negative agorot (got ${expiredCredits}, ${totalDebits})`,
    )
  }
  return agorot(Math.min(Math.max(0, expiredCredits - totalDebits), Math.max(0, balance)))
}
