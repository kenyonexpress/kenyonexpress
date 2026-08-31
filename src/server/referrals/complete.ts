import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { log } from '@/lib/observability/log'
import { referralFingerprint } from '@/lib/referrals/fingerprint'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Turns a paid order into a completed referral, if there is one to complete.
 *
 * WHY THIS IS SAFE TO CALL ON EVERY PAID ORDER
 *
 * `fn_complete_referral` is the whole decision and this function is only its
 * caller. It takes `FOR UPDATE` on the referral row, refuses anything that is
 * not still `pending`, checks the qualifying window, checks the minimum, runs
 * the fraud guard and the monthly and yearly caps, and only then moves money,
 * once, through the wallet, keyed by an idempotency string. So a replayed
 * webhook completes nothing twice, an order below the minimum is not a
 * rejection (a later, larger order inside the window still qualifies), and an
 * account with no referral gets `no_referral` and nothing happens.
 *
 * That is why there is no "is this their first order" test here. Writing one
 * would put a second, weaker copy of the same rule in TypeScript, where it
 * would be the one that drifts.
 *
 * WHY A FAILURE HERE IS LOGGED AND NOT THROWN
 *
 * The card has already been charged by the time finalize reaches this line. The
 * webhook reads any thrown error as "payment verified but finalize failed",
 * which is the worst state in the system and gets a human out of bed. A
 * referral bonus that did not post is a row an admin can settle from
 * `/admin/referrals` afterwards; an order stuck unpaid-but-charged is not. Same
 * judgement the stock consumption two lines above already makes, for the same
 * reason.
 */
export async function completeReferralForOrder(
  admin: SupabaseClient,
  input: {
    orderId: string
    userId: string
    /** The Cardcom card token, when this payment carried one. */
    cardToken?: string | null
  },
): Promise<void> {
  try {
    // Which generation of money columns this database has, cached per process
    // by the same probe the rest of the order path uses. Naming `total_agorot`
    // outright would 42703 against the hosted project, which is pre-059, and
    // that failure would arrive here as a lost bonus with no row to show for it.
    const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never, 'orders'))
    const { data, error } = await admin
      .from('orders')
      .select(orderMoneySelect(generation))
      .eq('id', input.orderId)
      .maybeSingle()

    if (error) {
      log.warn('referrals.complete_order_read_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
      return
    }

    // What the customer actually paid ON THE SITE, not the sticker subtotal.
    //
    // This is the conservative reading of `min_order_agorot` and it is a
    // decision, so it is written down: an order settled entirely out of wallet
    // credit brought in no cash, and the bonus is funded by cash. Using the
    // subtotal instead would let a referred account clear the minimum with
    // credit it was given, which is the cheapest way there is to turn one
    // bonus into the next one.
    const { totalAgorot } = readOrderMoney(generation, data as Record<string, unknown> | null)

    const { data: result, error: rpcError } = await admin.rpc(
      'fn_complete_referral' as never,
      {
        p_order_id: input.orderId,
        p_user_id: input.userId,
        p_order_agorot: totalAgorot,
        // The card is only known at payment, which is why 098 takes this signal
        // here and not at claim time. Hashed, so `referral_signals` never holds
        // a live token.
        p_card_hash: input.cardToken ? referralFingerprint('card', input.cardToken) : null,
      } as never,
    )

    if (rpcError) {
      log.warn('referrals.complete_failed', { orderId: input.orderId, reason: rpcError.message })
      return
    }

    const outcome = result as { ok?: boolean; reason?: string; status?: string } | null
    // `no_referral` and `program_inactive` are the ordinary answers for almost
    // every order on this site, so they are info and not warnings. A log level
    // that fires on every purchase is a log level nobody reads.
    log.info('referrals.complete_result', {
      orderId: input.orderId,
      ok: outcome?.ok === true,
      reason: outcome?.reason ?? null,
    })
  } catch (error) {
    log.warn('referrals.complete_threw', {
      orderId: input.orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}
