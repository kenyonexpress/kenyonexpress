/**
 * What an admin is shown about one customer's wallet, decided here and not in
 * the page, so it can be tested without a database.
 *
 * THE BUG THIS EXISTS TO CLOSE. `/admin/users/[id]` read `wallet_balances` and
 * `wallet_transactions`. Measured against production on 2026-09-10: both tables
 * hold ZERO rows, the money lives in `wallet_accounts` and `wallet_entries`,
 * and one real customer has 1.80 shekels there from two `order_cashback`
 * credits. The page rendered that customer's wallet as an unqualified 0.00 with
 * "no wallet movements" underneath. Not an error, not an empty state with a
 * caveat: a confident wrong number about somebody's money, on the screen
 * support opens when that person calls to ask where it went.
 *
 * WHY LIFETIME TOTALS ARE DERIVED AND NOT STORED. `wallet_balances` carried
 * `lifetime_earned_ils` and `lifetime_redeemed_ils` as maintained columns.
 * Summed from an append-only ledger instead, they cannot drift from it, and
 * drift between a cached total and its ledger is the failure this module also
 * reports rather than hides.
 *
 * WHY TRUNCATION IS A DIFFERENT ANSWER FROM ZERO DRIFT. The ledger is read
 * with a cap. Past the cap the sums are partial, so a lifetime total would
 * understate and a drift figure computed from it would be an invented
 * accusation against a balance that is probably fine. `complete: false` says
 * "not counted", which is the only honest thing left.
 *
 * Money is integer agorot throughout. Nothing here divides.
 */

export type WalletDirection = 'credit' | 'debit'

export interface AdminWalletEntry {
  id: string
  direction: WalletDirection
  /** Unsigned magnitude, integer agorot. */
  amountAgorot: number
  reason: string
  orderId: string | null
  createdAt: string
}

export type AdminWalletTotals =
  | {
      complete: true
      earnedAgorot: number
      redeemedAgorot: number
      /** credits - debits, what the ledger says the balance should be. */
      ledgerBalanceAgorot: number
      /** cached balance - ledger balance. Non-zero is a defect, not a rounding. */
      driftAgorot: number
    }
  | { complete: false }

export interface AdminWalletView {
  /** The cached balance on `wallet_accounts`, integer agorot. */
  balanceAgorot: number
  totals: AdminWalletTotals
  entries: AdminWalletEntry[]
}

/**
 * How many ledger rows are read before the totals stop being claimed.
 *
 * A customer wallet accumulates roughly one entry per order plus refunds, so
 * 500 covers every real account here by a wide margin. It is a cap and not a
 * belief: the point is that crossing it changes what the screen SAYS, rather
 * than quietly changing what it means.
 */
export const ADMIN_WALLET_LEDGER_CAP = 500

export function buildAdminWalletView(
  balanceAgorot: number,
  rows: ReadonlyArray<AdminWalletEntry>,
  cap: number = ADMIN_WALLET_LEDGER_CAP,
): AdminWalletView {
  const entries = [...rows]

  if (entries.length >= cap) {
    return { balanceAgorot, totals: { complete: false }, entries }
  }

  let earnedAgorot = 0
  let redeemedAgorot = 0
  for (const entry of entries) {
    if (entry.direction === 'credit') earnedAgorot += entry.amountAgorot
    else redeemedAgorot += entry.amountAgorot
  }

  const ledgerBalanceAgorot = earnedAgorot - redeemedAgorot
  return {
    balanceAgorot,
    totals: {
      complete: true,
      earnedAgorot,
      redeemedAgorot,
      ledgerBalanceAgorot,
      driftAgorot: balanceAgorot - ledgerBalanceAgorot,
    },
    entries,
  }
}
