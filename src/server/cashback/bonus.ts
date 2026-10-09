import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Awards the order-count cashback bonus for a freshly finalized order, if one
 * is owed.
 *
 * `fn_cashback_order_bonus` (migration 177) is the whole decision and this
 * function is only its caller: it takes the per-user advisory lock, counts
 * finalized orders, applies first-purchase 10% / every-fifth 5%, moves the
 * money through fn_wallet_transfer and writes the cashback_ledger row, all
 * keyed on `order:<id>:count_bonus` so a replayed webhook awards nothing
 * twice. Writing any of that here would be a second, weaker copy of the rule
 * in TypeScript, and the referral programme's comment on exactly this point
 * applies verbatim.
 *
 * LOGGED, NEVER THROWN. The card has already been charged by the time
 * finalize reaches this line, and a bonus that did not post is a ledger gap
 * an admin can settle from /admin/cashback afterwards; an order stuck
 * charged-but-unpaid is not. Same judgement as the referral and stock calls
 * beside it in finalize. A database that does not have migration 177 yet
 * answers 42883 (undefined function), which lands here as a logged skip.
 */
export async function awardOrderCountBonus(admin: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { data, error } = await admin.rpc('fn_cashback_order_bonus' as never, {
      p_order_id: orderId,
    })
    if (error) {
      log.warn('cashback.bonus_award_failed', { orderId, reason: error.message })
      return
    }
    const awarded = Number(data ?? 0)
    if (awarded > 0) {
      log.info('cashback.bonus_awarded', { orderId, amountAgorot: awarded })
    }
  } catch (err) {
    log.warn('cashback.bonus_award_failed', {
      orderId,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}
