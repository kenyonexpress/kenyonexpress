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
 * the fraud guard and the monthly and yearly caps, snapshots the bonus, and
 * answers one of `held_for_review` or `ready_to_pay`. So a replayed webhook
 * completes nothing twice, an order below the minimum is not a rejection (a
 * later, larger order inside the window still qualifies), and an account with
 * no referral gets `no_referral` and nothing happens.
 *
 * That is why there is no "is this their first order" test here. Writing one
 * would put a second, weaker copy of the same rule in TypeScript, where it
 * would be the one that drifts.
 *
 * THE PAYOUT IS A SECOND CALL, AND IT IS MADE HERE
 *
 * 098 split the decision from the money on purpose: `fn_complete_referral`
 * decides, `fn_pay_referral` credits both wallets, and the admin's approve
 * button runs the SAME pay function so the queue and the automatic path are
 * one tested path. What 098 did not do was call the second from the first.
 * Measured 2026-10-08: on a clean completion the SQL answered `ready_to_pay`
 * and left the row `pending` with the bonus snapshotted, and nothing anywhere
 * made the call, so "only clean completions pay without a human" (250) was
 * never true. This is the call. `fn_pay_referral` is idempotent on the row
 * (`already_paid`) and on each wallet entry (`referral:<id>:<side>`), so a
 * retried webhook that reaches it twice credits nothing twice. Pending 260
 * teaches `fn_complete_referral` to answer `qualified_unpaid` on a row whose
 * first order already qualified, so a pay that failed here is retried on the
 * next paid order instead of being re-snapshotted or expired.
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

    const outcome = result as {
      ok?: boolean
      reason?: string
      status?: string
      referral_id?: string
    } | null
    // `no_referral` and `program_inactive` are the ordinary answers for almost
    // every order on this site, so they are info and not warnings. A log level
    // that fires on every purchase is a log level nobody reads.
    log.info('referrals.complete_result', {
      orderId: input.orderId,
      ok: outcome?.ok === true,
      reason: outcome?.reason ?? null,
    })

    if (outcome?.ok === true && PAYABLE_ANSWERS.has(outcome.reason ?? '') && outcome.referral_id) {
      await payReferral(admin, { orderId: input.orderId, referralId: outcome.referral_id })
    }
  } catch (error) {
    log.warn('referrals.complete_threw', {
      orderId: input.orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * The two answers that mean "the decision is made, the money is owed":
 * `ready_to_pay` from 098 on the order that qualified, and `qualified_unpaid`
 * from 260 on a later order when an earlier pay call failed. Anything else
 * (`held_for_review`, `already_resolved`, `below_minimum`, ...) moves nothing.
 */
const PAYABLE_ANSWERS: ReadonlySet<string> = new Set(['ready_to_pay', 'qualified_unpaid'])

/**
 * Credits both wallets through `fn_pay_referral` and reports the answer.
 *
 * Logged, never thrown, for the reason given above: the card is charged and
 * finalize must not fail here. A bonus that did not post is a `pending` row
 * with `referred_first_order_id` set, which `/admin/referrals` lists as
 * "qualified, not yet paid" and the approve button settles through the same
 * function.
 */
async function payReferral(
  admin: SupabaseClient,
  input: { orderId: string; referralId: string },
): Promise<void> {
  const { data, error } = await admin.rpc(
    'fn_pay_referral' as never,
    { p_referral_id: input.referralId } as never,
  )
  if (error) {
    log.warn('referrals.pay_failed', {
      orderId: input.orderId,
      referralId: input.referralId,
      reason: error.message,
    })
    return
  }
  const paid = data as { ok?: boolean; reason?: string } | null
  const level = paid?.ok === true ? 'info' : 'warn'
  log[level]('referrals.pay_result', {
    orderId: input.orderId,
    referralId: input.referralId,
    ok: paid?.ok === true,
    reason: paid?.reason ?? null,
  })
}
