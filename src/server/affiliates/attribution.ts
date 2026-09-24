import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import { REFERRAL_COOKIE } from '@/lib/referrals/cookie'
import type { createAdminClient } from '@/lib/supabase/admin'
import { recordUserSignals, requestSignals } from '@/server/affiliates/signals'
import { cookies } from 'next/headers'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Snapshots the share code that brought this buyer here onto the order.
 *
 * WHY AT CHECKOUT AND NOT AT FINALIZE. Finalize runs from the Cardcom webhook,
 * which carries none of the buyer's cookies. The `ke_ref` cookie (set by the
 * proxy on any `?ref=` landing, 30 days, last touch) is only readable while
 * the buyer's own request is in flight, and the checkout action is the last
 * such request before the money moves. So the code is written down here, on
 * `orders.affiliate_code`, a column 010 created for exactly this and that
 * nothing had ever written.
 *
 * WHY ITS OWN STATEMENT AND NOT A COLUMN IN THE ORDER INSERT. The insert in
 * checkout.ts is the one statement that must not fail, and its header records
 * why: naming a column the hosted database lacks failed the whole purchase
 * flow with 42703 once. `affiliate_code` is in the generated types, so it is
 * there today, but the discipline is the same as for the gift columns: a
 * failure here is an unattributed order, never an uncreated one.
 *
 * NOTHING IS DECIDED HERE. Whether the code belongs to an approved affiliate,
 * whether a campaign is live, whether the buyer is the affiliate: all of that
 * is `recordAffiliateConversionForOrder` at finalize, where the order is
 * paid. A code that names nobody is snapshotted and later ignored.
 *
 * The buyer's device and IP go into `referral_signals` at the same time, so
 * the fraud guard at finalize has something to compare the affiliate against.
 *
 * @returns the normalised code that was written, or null when there was none.
 */
export async function snapshotAffiliateAttribution(
  admin: AdminClient,
  input: { orderId: string; userId: string },
): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const code = normalizeReferralCode(cookieStore.get(REFERRAL_COOKIE)?.value)
    if (!code) return null

    const { error } = await admin
      .from('orders')
      .update({ affiliate_code: code })
      .eq('id', input.orderId)
    if (error) {
      log.warn('affiliates.attribution_write_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
      return null
    }

    const signals = await requestSignals()
    await recordUserSignals(admin, input.userId, signals)

    log.info('affiliates.attributed', { orderId: input.orderId })
    return code
  } catch (error) {
    log.warn('affiliates.attribution_threw', {
      orderId: input.orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}
