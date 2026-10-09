import {
  type CashbackOverview,
  type NextBonus,
  cashbackOverview,
  nextBonus,
} from '@/lib/cashback/tracker'
import { orFail } from '@/lib/catalogue-read'
import { type Agorot, agorot } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import { getWalletLedger } from '@/server/queries/account'
import { getMyOrders } from '@/server/queries/orders'

/**
 * The cashback tracker's reads. Same rule as the rest of queries/account.ts:
 * the request-scoped client, so `cashback_ledger_owner_select` (177) and the
 * wallet owner policies decide what comes back, not a filter we remembered.
 *
 * Three sources, one screen:
 *  - `v_wallet_ledger` for the money that actually moved (credits and every
 *    debit), which is what the expiry arithmetic runs over;
 *  - `cashback_ledger` for the WHY of each credit: entry type, rate, basis,
 *    order, so the history table can say "10% of ₪120 on order X";
 *  - the customer's orders for the paid count that ranks the next bonus.
 */

export interface CashbackHistoryRow {
  id: string
  entryType: string
  /** Signed integer agorot: negative for an expiry or a negative adjustment. */
  amountAgorot: Agorot
  /** Rate applied, basis points, when the entry was a percentage award. */
  percentBp: number | null
  /** The order total the rate was applied to, integer agorot. */
  basisAgorot: Agorot | null
  orderId: string | null
  reason: string | null
  createdAt: string
}

export interface CashbackTracker {
  overview: CashbackOverview
  next: NextBonus
  paidOrderCount: number
  history: CashbackHistoryRow[]
}

export async function getCashbackHistory(limit = 100): Promise<CashbackHistoryRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const data = orFail(
    await supabase
      .from('cashback_ledger')
      .select(
        'id, entry_type, amount_agorot, percent_bp, basis_agorot, order_id, reason, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    'account.cashback_ledger_read_failed',
    { userId: user.id },
  )

  return (data ?? []).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amountAgorot: agorot(row.amount_agorot),
    percentBp: row.percent_bp,
    basisAgorot: row.basis_agorot == null ? null : agorot(row.basis_agorot),
    orderId: row.order_id,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

export async function getCashbackTracker(now?: Date): Promise<CashbackTracker> {
  const [ledger, orders, history] = await Promise.all([
    getWalletLedger(500),
    getMyOrders(),
    getCashbackHistory(),
  ])
  // Read AFTER the awaits, not as a default parameter. The reads above go
  // through cookies(), which is what marks this render request-time; a clock
  // read before them is what the prerender step refuses as "unstable".
  const at = now ?? new Date()
  // `paid_at IS NOT NULL` is the SQL's own definition of a purchase that
  // counts (fn_cashback_order_bonus); the status column is not consulted.
  const paidOrderCount = orders.filter((order) => order.paidAt !== null).length
  return {
    overview: cashbackOverview(ledger, at),
    next: nextBonus(paidOrderCount),
    paidOrderCount,
    history,
  }
}
