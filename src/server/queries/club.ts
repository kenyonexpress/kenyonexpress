import { orFail } from '@/lib/catalogue-read'
import {
  CLUB_SPEND_STATUSES,
  type ClubOrderRow,
  type ClubStanding,
  clubStanding,
  clubWindowStart,
  sumClubSpend,
} from '@/lib/club/tiers'
import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { agorot } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * The signed-in customer's club standing: tier, twelve-month spend, and how
 * far they are from the next tier. Null when nobody is signed in.
 *
 * COMPUTED AT READ TIME, NOT STORED. There is no `club_tier` column and no
 * nightly job: the standing is a sum over the customer's own paid orders in
 * the last 365 days, decided by `lib/club/tiers.ts`. A stored tier would be a
 * second copy of that rule that has to be kept in step by a job that can miss
 * a night (see 227's header on exactly that shape), and it would need a
 * migration this feature would then be blocked behind. Every column read here
 * exists in production today.
 *
 * THE SAME SHAPE AS `getMyOrders`: session for the id, the admin client for
 * the read pinned to that id, and the money-column generation resolved rather
 * than named, so the select does not 42703 on either schema lineage.
 *
 * THE SERVER-SIDE FILTER IS `created_at >= windowStart`; the exact rule
 * (`paid_at`, falling back to `created_at`) is applied by `sumClubSpend` on
 * the rows that come back. An order created before the window but paid inside
 * it would be missed, and cannot happen: an unpaid order expires within the
 * hour (`orders.expires_at`) and finalize refuses one that has.
 *
 * `orFail`, not `const { data }`: a failed read here must not render as
 * "member, ₪0" to a platinum customer with nothing in any log.
 */
export async function getClubStanding(clock?: Date): Promise<ClubStanding | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // The clock is read AFTER the session, never as a parameter default: under
  // `cacheComponents` a `new Date()` reached before the first request-bound
  // read is a prerender error on the whole account page (measured: the build
  // failed on exactly that line). The session read above is what makes this
  // request-scoped, and `clock` exists for the test.
  const now = clock ?? new Date()

  const admin = createAdminClient()
  const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never))
  const windowStart = clubWindowStart(now)

  const rows = orFail(
    await admin
      .from('orders')
      .select(`status, paid_at, created_at, ${orderMoneySelect(generation)}`)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('status', [...CLUB_SPEND_STATUSES])
      .gte('created_at', windowStart)
      .limit(1000),
    'club.spend_read_failed',
    { userId: user.id },
  )

  type SpendRow = Record<string, unknown> & {
    status: string
    paid_at: string | null
    created_at: string
  }
  const orders = (rows ?? []) as unknown as SpendRow[]

  const spendRows: ClubOrderRow[] = orders.map((order) => ({
    status: order.status,
    paid_at: order.paid_at,
    created_at: order.created_at,
    totalAgorot: agorot(readOrderMoney(generation, order).totalAgorot),
  }))

  return clubStanding(sumClubSpend(spendRows, now), now)
}
