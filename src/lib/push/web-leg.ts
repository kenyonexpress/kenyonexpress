import { log } from '@/lib/observability/log'
import type { PushContent } from '@/lib/push/templates'
import { type WebPushOutcome, sendWebPush, vapidConfig } from '@/lib/push/web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One notification, fanned out to every browser a customer said yes in.
 *
 * WHY THIS IS A SEPARATE LEG FROM EXPO. They are different transports with
 * different failure vocabularies against different tables. Expo speaks tickets
 * and `DeviceNotRegistered` against `push_tokens`; a push service speaks HTTP
 * status codes against `push_subscriptions`. Folding them into one function
 * would mean one set of outcome names describing two things, and the place that
 * always goes wrong is the dead-device case: Expo's is soft (`enabled = false`,
 * keep the row and the reason) and web's is hard (410 means that endpoint is
 * never valid again).
 *
 * A CUSTOMER WITH TWO BROWSERS IS THE NORMAL CASE, and it is why the aggregate
 * below is not a boolean. A phone whose browser data was cleared answers 410
 * forever while the desktop works. If one dead subscription made the whole leg
 * retry, the working browser would be sent the same notification five more
 * times before the row died.
 */

export interface WebPushLegResult {
  /** Subscriptions the push service accepted. */
  sent: number
  /** 404/410. The row was deleted; the delivery log holds the record. */
  gone: number
  /** Transient. Worth another attempt from the outbox's own backoff. */
  retry: number
  /** Permanent and ours: oversized payload, bad VAPID, mismatched keys. */
  rejected: number
  /** Why nothing was attempted, when nothing was. */
  reason: string | null
}

interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

const EMPTY: WebPushLegResult = { sent: 0, gone: 0, retry: 0, rejected: 0, reason: null }

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

/**
 * The push service, not the endpoint.
 *
 * The endpoint is a bearer capability: anyone holding it can push to that
 * browser. It must not reach the delivery log, a log line or a support ticket.
 * The host answers the only question triage asks of it, which is which service
 * is failing.
 */
export function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host
  } catch {
    return null
  }
}

async function recordDelivery(
  admin: SupabaseClient,
  entry: {
    outboxId: string | null
    subscriptionId: string | null
    userId: string | null
    kind: string
    outcome: 'sent' | 'gone' | 'retry' | 'rejected' | 'skipped'
    statusCode: number | null
    endpointHost: string | null
    reason: string | null
  },
): Promise<void> {
  const { error } = await admin.from('push_deliveries' as never).insert({
    outbox_id: entry.outboxId,
    subscription_id: entry.subscriptionId,
    user_id: entry.userId,
    kind: entry.kind,
    transport: 'web',
    outcome: entry.outcome,
    status_code: entry.statusCode,
    endpoint_host: entry.endpointHost,
    reason: entry.reason?.slice(0, 500) ?? null,
  } as never)

  // The log is not the job. 215 is written and unapplied, so every insert here
  // fails until it lands, and a notification that was delivered must not be
  // reported as failed because the record of it could not be written.
  if (error && !MISSING_TABLE.has(error.code ?? '')) {
    log.warn('push.delivery_log_failed', { reason: error.message })
  }
}

export async function sendWebPushLeg(
  admin: SupabaseClient,
  row: { id?: string; kind: string; user_id: string | null },
  content: PushContent,
): Promise<WebPushLegResult> {
  const vapid = vapidConfig()
  if (!vapid) return { ...EMPTY, reason: 'VAPID keys not configured' }
  // A subscription belongs to an account. There is no such thing as an
  // anonymous browser subscription here: 179 requires user_id.
  if (!row.user_id) return { ...EMPTY, reason: 'no account to look up browsers for' }

  const { data, error } = await admin
    .from('push_subscriptions' as never)
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', row.user_id)

  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) return { ...EMPTY, reason: '179 not applied' }
    return { ...EMPTY, retry: 1, reason: error.message }
  }

  const subscriptions = (data ?? []) as unknown as SubscriptionRow[]
  if (subscriptions.length === 0) return { ...EMPTY, reason: 'no browser subscribed' }

  const result: WebPushLegResult = { sent: 0, gone: 0, retry: 0, rejected: 0, reason: null }
  const dead: string[] = []

  // Sequential and not Promise.all, deliberately. A customer has a handful of
  // browsers, so there is nothing to win, and a push service that is throttling
  // us answers 429 to a burst where it would have accepted a trickle.
  for (const subscription of subscriptions) {
    const outcome: WebPushOutcome = await sendWebPush(subscription, content, vapid)
    const host = endpointHost(subscription.endpoint)

    if (outcome.kind === 'sent') result.sent += 1
    else if (outcome.kind === 'gone') {
      result.gone += 1
      dead.push(subscription.id)
    } else if (outcome.kind === 'retry') result.retry += 1
    else result.rejected += 1

    await recordDelivery(admin, {
      outboxId: row.id ?? null,
      subscriptionId: subscription.id,
      userId: subscription.user_id,
      kind: row.kind,
      outcome: outcome.kind,
      statusCode: outcome.kind === 'sent' ? 201 : (outcome.status ?? null),
      endpointHost: host,
      reason: outcome.kind === 'sent' || outcome.kind === 'gone' ? null : outcome.reason,
    })
  }

  // UNSUBSCRIBE HANDLING. 404 and 410 are final: that endpoint is never valid
  // again, and keeping the row means paying a network round trip on every run
  // forever to be told the same thing. Deleted rather than flagged, because
  // unlike an Expo token there is nothing a customer or an operator could ever
  // do to revive it -- and the reason is preserved in the delivery log, which
  // is why `push_deliveries.subscription_id` is not a foreign key.
  if (dead.length > 0) {
    const { error: deleteError } = await admin
      .from('push_subscriptions' as never)
      .delete()
      .in('id', dead)
    if (deleteError) {
      log.warn('push.dead_subscription_cleanup_failed', {
        reason: deleteError.message,
        count: dead.length,
      })
    }
  }

  return result
}
