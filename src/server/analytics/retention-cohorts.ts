import 'server-only'

import { retentionPersonProperties } from '@/lib/analytics/retention-cohorts'
import { isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The user's paid-order timestamps, from `orders.paid_at` and nothing else.
 *
 * `paid_at` is the same column the first-party revenue cohorts key on
 * (server/analytics/cohorts.ts), so a person's PostHog acquisition month and
 * their row in the admin cohort grid agree by construction. Refunds do not
 * null `paid_at`, and that is right for retention: a refunded order was still
 * a purchase decision, and the refund is its own event (`order_refunded`).
 *
 * null on any failure, never a throw and never a partial list: a stale label
 * in PostHog is a cohort one person short today, a label built from half the
 * rows is a person misfiled until the next purchase.
 */
export async function paidAtForUser(userId: string): Promise<string[] | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('orders')
      .select('paid_at')
      .eq('user_id', userId)
      .not('paid_at', 'is', null)
    if (error || !data) return null
    return data.map((row) => row.paid_at).filter((value): value is string => Boolean(value))
  } catch {
    return null
  }
}

/**
 * Writes the retention properties onto the PostHog person after a purchase.
 *
 * Same shape as syncCashbackTierPersonProperty: a dedicated `$set` event
 * rather than `$set` on `purchase` itself, so the funnel event keeps firing
 * before any database round trip and the properties arrive a moment later,
 * keyed on the same id. Best effort end to end; callers must not await
 * anything user-visible on it.
 */
export async function syncRetentionPersonProperties(
  userId: string,
  distinctId: string | undefined,
): Promise<void> {
  if (!isPostHogEnabled()) return
  const paidAt = await paidAtForUser(userId)
  if (paidAt === null) return
  const properties = retentionPersonProperties(paidAt)
  if (properties === null) return
  trackEvent('$set', {}, { distinctId, set: properties })
}
