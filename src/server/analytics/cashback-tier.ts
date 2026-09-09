import 'server-only'

import { ilsColumnToAgorot } from '@/lib/account/format'
import {
  CASHBACK_TIER_PROPERTY,
  type CashbackTier,
  cashbackTier,
} from '@/lib/analytics/cashback-tier'
import { isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The user's lifetime cashback, bucketed for PostHog cohorts.
 *
 * Read from `v_wallet_ledger` (credit rows, reason `order_cashback`) rather
 * than from the wallet balance, deliberately: the balance FALLS when the
 * wallet is spent, and a cohort of "shoppers who earned a lot of cashback"
 * must not eject its best members the moment they use it. Lifetime earned
 * only ever grows, which is what a tier label needs.
 *
 * Sums decimal `amount_ils` values that each pass through `ilsColumnToAgorot`
 * (the same parse the wallet page trusts), so the comparison happens on
 * integer agorot and no float survives past this function.
 *
 * null on any failure, never a throw and never a guessed tier: a missing
 * label in PostHog is a person a cohort skips today, a wrong label is a
 * person it misfiles for as long as nobody notices.
 */
export async function cashbackTierForUser(userId: string): Promise<CashbackTier | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('v_wallet_ledger')
      .select('amount_ils')
      .eq('user_id', userId)
      .eq('direction', 'credit')
      .eq('reason', 'order_cashback')
    if (error || !data) return null
    const lifetimeAgorot = data.reduce((sum, row) => sum + ilsColumnToAgorot(row.amount_ils), 0)
    return cashbackTier(lifetimeAgorot)
  } catch {
    return null
  }
}

/**
 * Writes `cashback_tier` onto the PostHog person after a money event.
 *
 * A dedicated `$set` event rather than `$set` on the funnel event itself, so
 * the funnel event keeps firing BEFORE any database round trip (track.ts rule:
 * a slow query must never decide whether the conversion was reported) and the
 * person property simply arrives a moment later, keyed on the same id.
 *
 * Best effort end to end: no PostHog key, no rows, a refused query, all mean
 * no event and no error. Callers must not await anything user-visible on it.
 */
export async function syncCashbackTierPersonProperty(
  userId: string,
  distinctId: string | undefined,
): Promise<void> {
  if (!isPostHogEnabled()) return
  const tier = await cashbackTierForUser(userId)
  if (tier === null) return
  trackEvent('$set', {}, { distinctId, set: { [CASHBACK_TIER_PROPERTY]: tier } })
}
