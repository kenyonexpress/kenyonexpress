import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recomputes a customer's loyalty tier after a paid order, and lets the
 * database announce an upgrade (STEP 47).
 *
 * `fn_refresh_loyalty_tier` (pending 261) is the whole decision: it sums the
 * trailing-365-day spend, upserts `loyalty_tiers`, and when the tier rose it
 * writes the bell row and enqueues `loyalty_tier_upgraded` under a dedupe
 * key per user, tier and day. This function only calls it. There is no
 * TypeScript copy of the upgrade rule here, for the same reason
 * `completeReferralForOrder` has none: a second copy is the one that drifts.
 * What TypeScript does own is the LIVE tier (`src/lib/loyalty/tiers.ts`),
 * which the badge and the cart compute from orders at read time; the row
 * this refreshes only remembers what was announced.
 *
 * WHY A FAILURE IS LOGGED AND NOT THROWN. finalize reaches this line after
 * the card was charged. A tier that was not refreshed is refreshed by the
 * next paid order; an order stuck paid-but-unfinalized gets a human out of
 * bed. Same judgement as the referral and stock calls beside it.
 *
 * UNTIL 261 IS APPLIED the RPC does not exist and PostgREST answers
 * PGRST202 (or Postgres 42883). That is the expected state of production
 * today, so it is logged at info with the migration named, not as a warning
 * that would fire on every purchase.
 */

export type LoyaltyRefreshOutcome =
  | { status: 'refreshed'; tier: string; previousTier: string; upgraded: boolean }
  | { status: 'not_applied' }
  | { status: 'failed' }

const FUNCTION_MISSING = new Set(['PGRST202', '42883'])

export async function refreshLoyaltyTierForOrder(
  admin: SupabaseClient,
  input: { orderId: string; userId: string | null },
): Promise<LoyaltyRefreshOutcome> {
  if (!input.userId) return { status: 'not_applied' }
  try {
    const { data, error } = await admin.rpc(
      'fn_refresh_loyalty_tier' as never,
      {
        p_user_id: input.userId,
      } as never,
    )
    if (error) {
      if (FUNCTION_MISSING.has(error.code ?? '')) {
        log.info('loyalty.refresh_not_applied', {
          orderId: input.orderId,
          hint: 'migration 261 creates fn_refresh_loyalty_tier',
        })
        return { status: 'not_applied' }
      }
      log.warn('loyalty.refresh_failed', { orderId: input.orderId, reason: error.message })
      return { status: 'failed' }
    }
    const result = (data ?? null) as {
      ok?: boolean
      tier?: string
      previous_tier?: string
      upgraded?: boolean
    } | null
    if (!result || result.ok !== true) {
      log.warn('loyalty.refresh_refused', { orderId: input.orderId, result })
      return { status: 'failed' }
    }
    log.info('loyalty.refresh_result', {
      orderId: input.orderId,
      tier: result.tier ?? null,
      upgraded: result.upgraded === true,
    })
    return {
      status: 'refreshed',
      tier: result.tier ?? 'bronze',
      previousTier: result.previous_tier ?? 'bronze',
      upgraded: result.upgraded === true,
    }
  } catch (error) {
    log.warn('loyalty.refresh_threw', {
      orderId: input.orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return { status: 'failed' }
  }
}
