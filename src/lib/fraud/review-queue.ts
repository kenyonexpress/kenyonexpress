import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Writers and readers for the two fraud tables (migrations/pending/226).
 *
 * BEST-EFFORT BY CONTRACT. Every function here is called from inside the
 * checkout path, and the fraud rail must never be the reason a sale dies:
 * a queue insert that fails, a table that is not migrated yet (42P01), or a
 * dedupe collision (23505, one pending row per user and kind is the design)
 * are all logged and swallowed. The flag READ fails open the same way the
 * rate limiter does: an outage is an open door that gets logged loudly, not
 * a locked shop.
 *
 * The tables are outside the generated types on purpose (they are newer than
 * `src/types/database.ts`), hence the `as never` casts, which is this
 * codebase's marker for exactly that state.
 */

type ServiceClient = ReturnType<typeof createAdminClient>

/** Postgres: relation does not exist. The migration has not been applied. */
const TABLE_MISSING = '42P01'
/** Postgres: unique violation. The pending dedupe index did its job. */
const DUPLICATE = '23505'

export type FraudReviewKind = 'velocity' | 'coupon-stacking' | 'chargeback-blocked' | 'manual'

export type FraudReviewItem = {
  userId: string
  orderId?: string | null
  kind: FraudReviewKind
  details?: Record<string, unknown>
}

/**
 * Puts a customer in front of a reviewer. One pending item per (user, kind):
 * the partial unique index collapses repeat triggers, so a bot hammering the
 * velocity wall makes one queue row, not five hundred.
 */
export async function enqueueFraudReview(
  admin: ServiceClient,
  item: FraudReviewItem,
): Promise<void> {
  try {
    const { error } = await admin.from('fraud_review_queue' as never).insert({
      user_id: item.userId,
      order_id: item.orderId ?? null,
      kind: item.kind,
      details: item.details ?? {},
    } as never)
    if (!error || error.code === DUPLICATE) return
    if (error.code === TABLE_MISSING) {
      log.warn('fraud.queue_table_missing', { kind: item.kind })
      return
    }
    log.error('fraud.enqueue_failed', { kind: item.kind, reason: error.message })
  } catch (error) {
    log.error('fraud.enqueue_failed', {
      kind: item.kind,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * True when the customer has an uncleared chargeback or manual block on file.
 * Velocity flags are advisory and do not block, so they are not consulted.
 */
export async function hasBlockingFraudFlag(admin: ServiceClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('fraud_flags' as never)
      .select('id')
      .eq('user_id' as never, userId as never)
      .in('kind' as never, ['chargeback', 'manual'] as never)
      .is('cleared_at' as never, null)
      .limit(1)
      .maybeSingle()
    if (error) {
      if (error.code !== TABLE_MISSING) {
        log.error('fraud.flag_read_failed', { reason: error.message })
      }
      return false
    }
    return data !== null
  } catch (error) {
    log.error('fraud.flag_read_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
