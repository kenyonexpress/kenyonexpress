/**
 * The Cardcom webhook dead-letter queue.
 *
 * There is no separate table. A dead letter is a row of
 * `payment_webhook_events` that got through re-verification and never reached
 * `processed_at`:
 *
 *     verified_against_api = true AND processed_at IS NULL
 *
 * That pair is only reachable one way. The route persists the event, re-checks
 * it against Cardcom's own API, writes `verified_against_api`, and only stamps
 * `processed_at` once `finalizeOrder` has actually closed the order. So a row
 * in this state means precisely: Cardcom charged the customer, we confirmed the
 * charge with Cardcom directly, and our own finalize did not complete. That is
 * the one failure in this system where the money moved and the order did not.
 *
 * It used to be unreachable. `processed_at` was stamped one statement BEFORE
 * finalize ran, so a finalize failure left a row that claimed to be handled,
 * and the only trace was an alarm. Nothing could enumerate the damage
 * afterwards, let alone replay it.
 *
 * Replay is safe to run repeatedly: `finalizeOrder` is idempotent on
 * `orders.status` and `payments.status`, and a row that succeeds on retry is
 * stamped and leaves the queue. Nothing here re-charges anything; the charge
 * already happened, which is the whole problem being cleaned up.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type DeadLetter = {
  id: string
  externalEventId: string
  paymentId: string | null
  createdAt: string
}

export type DeadLetterReplay = {
  event: DeadLetter
  ok: boolean
  error?: string
}

/** How many times a single sweep will touch one event. */
export const DLQ_BATCH_LIMIT = 50

type MinimalClient = Pick<SupabaseClient, 'from'>

/**
 * Events that were charged and verified but never closed, oldest first.
 *
 * Oldest first because these are real customers holding a charge against an
 * open order: the one who has been waiting longest is the one to fix first.
 */
export async function listDeadLetters(
  admin: MinimalClient,
  limit: number = DLQ_BATCH_LIMIT,
): Promise<DeadLetter[]> {
  const { data, error } = await admin
    .from('payment_webhook_events')
    .select('id, external_event_id, payment_id, created_at')
    .eq('provider', 'cardcom')
    .eq('verified_against_api', true)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    paymentId: row.payment_id == null ? null : String(row.payment_id),
    createdAt: String(row.created_at),
  }))
}

/**
 * Marks one event done. Called only after a finalize actually succeeded.
 *
 * Scoped by id rather than by (provider, external_event_id) so a replay cannot
 * stamp a different row that happens to share an event id, which is possible
 * while the unique index is being rebuilt.
 */
export async function markProcessed(
  admin: MinimalClient,
  eventId: string,
  now: Date = new Date(),
): Promise<void> {
  await admin
    .from('payment_webhook_events')
    .update({ processed_at: now.toISOString() })
    .eq('id', eventId)
}

export type FinalizeForReplay = (paymentId: string) => Promise<{ ok: boolean; error?: string }>

/**
 * Replays the queue once.
 *
 * A dead letter with no `payment_id` cannot be replayed: we never established
 * which payment it belonged to, so there is nothing to finalize. It is
 * reported rather than silently skipped, because it needs a human, and
 * `processed_at` stays null so it keeps showing up until one looks.
 */
export async function replayDeadLetters(
  admin: MinimalClient,
  finalize: FinalizeForReplay,
  limit: number = DLQ_BATCH_LIMIT,
): Promise<DeadLetterReplay[]> {
  const events = await listDeadLetters(admin, limit)
  const results: DeadLetterReplay[] = []

  for (const event of events) {
    if (!event.paymentId) {
      results.push({ event, ok: false, error: 'event has no payment_id; cannot replay' })
      continue
    }

    let outcome: { ok: boolean; error?: string }
    try {
      outcome = await finalize(event.paymentId)
    } catch (cause) {
      // A throwing finalize must not take the sweep down with it: the
      // remaining events are other people's money.
      outcome = { ok: false, error: cause instanceof Error ? cause.message : 'finalize threw' }
    }

    if (outcome.ok) await markProcessed(admin, event.id)
    results.push({ event, ok: outcome.ok, ...(outcome.error ? { error: outcome.error } : {}) })
  }

  return results
}
