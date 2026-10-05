import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'
import { computeClubStanding } from '@/server/queries/club'

/**
 * The buyer's club tier, written onto the order they have just created.
 *
 * DISPLAY ONLY. Nothing prices, discounts or refuses on `club_tier`; the
 * column answers "what tier was this customer when they bought" on the order
 * page and in admin, which the read-time rule cannot answer once the window
 * has rolled past the order.
 *
 * ITS OWN STATEMENT, AFTER THE INSERT, NEVER FATAL. The same shape as the gift
 * columns and the risk score in checkout.ts, for the same reason that whole
 * block is commented: `orders.club_tier` is from pending 251, and naming a
 * column the hosted database lacks in the INSERT would fail the statement and
 * no order could be created at all. Here the worst case is an order with no
 * tier on it and one warning line. Every failure path, including a thrown
 * read, lands in `checkout.club_tier_not_recorded`.
 *
 * THE ORDER DOES NOT COUNT TOWARDS ITSELF: it is `pending` when this runs and
 * `pending` is not a club spend status, so the snapshot is the standing the
 * customer saw on /account the moment before they paid.
 */
export async function snapshotClubTierOnOrder(
  admin: ReturnType<typeof createAdminClient>,
  input: { orderId: string; userId: string; now: Date },
): Promise<{ recorded: boolean; tier?: string }> {
  try {
    const standing = await computeClubStanding(admin, input.userId, input.now)
    const { error } = await admin
      .from('orders')
      .update({
        club_tier: standing.tier.id,
        club_spend_agorot: standing.spendAgorot,
      } as never)
      .eq('id', input.orderId)
    if (error) {
      log.warn('checkout.club_tier_not_recorded', {
        order_id: input.orderId,
        err: error.message,
        code: error.code,
      })
      return { recorded: false }
    }
    return { recorded: true, tier: standing.tier.id }
  } catch (cause) {
    log.warn('checkout.club_tier_not_recorded', {
      order_id: input.orderId,
      err: cause instanceof Error ? cause.message : String(cause),
    })
    return { recorded: false }
  }
}
