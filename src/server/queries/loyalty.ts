import { orFail } from '@/lib/catalogue-read'
import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import {
  type LoyaltyTier,
  type SpendableOrder,
  type TierProgress,
  isLoyaltyTier,
  lockedDealLabel,
  meetsTier,
  spendInWindow,
  tierProgress,
} from '@/lib/loyalty/tiers'
import { type Agorot, agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * The signed-in customer's loyalty standing (STEP 47).
 *
 * COMPUTED, NOT STORED. The tier is `tierForSpend` over the customer's own
 * paid orders inside the trailing window, decided at request time, so the
 * badge, the account page and the discount gate all answer from one
 * function over one read and can never disagree with each other or with
 * yesterday. The `loyalty_tiers` row (pending 261) is read only for the
 * date the customer reached the tier they were last told about; until 261
 * is applied PostgREST answers PGRST205 and that date is simply absent.
 *
 * WHY THE ADMIN CLIENT FOR THE ORDERS READ. Same reason as `getMyOrders`:
 * the money select is built at runtime from the probe, and the request
 * client's generated types reject a dynamic select. The filter is the
 * session's own user id, taken from `auth.getUser()`, never from input.
 */

export interface LoyaltyStanding {
  tier: LoyaltyTier
  /** Integer agorot paid on the site inside the window. */
  spendAgorot: Agorot
  progress: TierProgress
  /** When the customer reached the tier they were last told about; null before 261 or before any refresh. */
  tierSince: string | null
  /** The tier the database last announced, which can lag the live one. */
  announcedTier: LoyaltyTier | null
  paidOrderCount: number
}

export interface TierDeal {
  id: string
  code: string
  name: string
  /** The tier the code needs. Never null: open campaigns are not "tier deals". */
  minTier: LoyaltyTier
  /** Whether this customer's live tier unlocks it. The code is only shown when true. */
  unlocked: boolean
  /** Hebrew under a locked row. */
  lockedLabel: string
  expiresAt: string | null
}

const RELATION_MISSING = new Set(['PGRST205', '42P01'])
const COLUMN_MISSING = '42703'

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * The lean orders read behind the tier: status, paid_at and the on-site
 * total, nothing else. `getMyOrders` would do, but it joins every line of
 * every order to fold shipping, and the cart calls this on every coupon
 * evaluation.
 */
async function readSpendableOrders(userId: string): Promise<SpendableOrder[]> {
  const admin = createAdminClient()
  const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never))
  const rows = orFail(
    await admin
      .from('orders')
      .select(`id, status, paid_at, ${orderMoneySelect(generation)}`)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('paid_at', 'is', null)
      .limit(500),
    'loyalty.orders_read_failed',
    { userId },
  )
  return ((rows ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    status: String(row.status ?? ''),
    paidAt: typeof row.paid_at === 'string' ? row.paid_at : null,
    totalAgorot: agorot(readOrderMoney(generation, row).totalAgorot),
  }))
}

/** The remembered row, or null when 261 is not applied or nothing was written yet. */
async function readAnnouncedTier(
  userId: string,
): Promise<{ tier: LoyaltyTier; tierSince: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('loyalty_tiers')
    .select('tier, tier_since')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (RELATION_MISSING.has(error.code)) return null
    log.warn('loyalty.announced_read_failed', { userId, reason: error.message })
    return null
  }
  if (!data || !isLoyaltyTier(data.tier)) return null
  return { tier: data.tier, tierSince: data.tier_since }
}

/**
 * Null for a guest. The one call the cart makes.
 *
 * A read that fails here answers null, logged: the cart must still price
 * when the tier cannot be read, and null is the conservative answer (a
 * tier-only code is refused, every open code is unaffected). The account
 * page keeps `getMyLoyalty`'s loud failure; a cart is not the place for it.
 */
export async function currentLoyaltyTier(now?: Date): Promise<LoyaltyTier | null> {
  const userId = await sessionUserId()
  if (!userId) return null
  try {
    const orders = await readSpendableOrders(userId)
    return tierProgress(spendInWindow(orders, now ?? new Date())).tier
  } catch (error) {
    log.warn('loyalty.tier_read_failed', {
      userId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

export async function getMyLoyalty(now?: Date): Promise<LoyaltyStanding | null> {
  const userId = await sessionUserId()
  if (!userId) return null
  const [orders, announced] = await Promise.all([
    readSpendableOrders(userId),
    readAnnouncedTier(userId),
  ])
  // After the awaits, like getCashbackTracker: the clock read is what the
  // prerender step refuses before a cookie read has marked the render dynamic.
  const at = now ?? new Date()
  const spendAgorot = spendInWindow(orders, at)
  const progress = tierProgress(spendAgorot)
  return {
    tier: progress.tier,
    spendAgorot,
    progress,
    tierSince: announced?.tierSince ?? null,
    announcedTier: announced?.tier ?? null,
    paidOrderCount: orders.filter((o) => o.paidAt !== null).length,
  }
}

/**
 * Every active campaign that carries a minimum tier, with whether this
 * customer's tier unlocks it. Service role: `discount_campaigns` has no
 * client policy (the cart reads it the same way). A locked row shows its
 * name and the tier it needs, never its code: the code is the deal.
 *
 * Before 261 the column does not exist, the select answers 42703, and the
 * list is empty rather than an error: a tier page with no deals yet is a
 * true statement.
 */
export async function getTierDeals(tier: LoyaltyTier | null, now?: Date): Promise<TierDeal[]> {
  const admin = createAdminClient()
  const at = (now ?? new Date()).toISOString()
  const { data, error } = await admin
    .from('discount_campaigns')
    .select('id, code, name, min_loyalty_tier, expires_at, starts_at')
    .eq('is_active', true)
    .is('deleted_at', null)
    .not('min_loyalty_tier', 'is', null)
    .order('min_loyalty_tier', { ascending: true })
  if (error) {
    if (error.code === COLUMN_MISSING || RELATION_MISSING.has(error.code)) return []
    log.warn('loyalty.deals_read_failed', { reason: error.message })
    return []
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
    const minTier = row.min_loyalty_tier
    if (!isLoyaltyTier(minTier) || minTier === 'bronze') return []
    const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : null
    if (expiresAt && expiresAt <= at) return []
    if (startsAt && startsAt > at) return []
    const unlocked = meetsTier(tier, minTier)
    return [
      {
        id: String(row.id),
        // The code is the deal: a locked row never carries it to the page.
        code: unlocked ? String(row.code) : '',
        name: String(row.name ?? ''),
        minTier,
        unlocked,
        lockedLabel: lockedDealLabel(minTier),
        expiresAt,
      },
    ]
  })
}
