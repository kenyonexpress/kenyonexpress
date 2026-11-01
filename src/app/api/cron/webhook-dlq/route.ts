import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import { recordPaymentEvent } from '@/server/payments/payment-events'
import { replayDeadLetters } from '@/server/payments/webhook-dlq'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The drain the dead-letter queue never had.
 *
 * `webhook-dlq.ts` defines the queue (charged, verified with Cardcom directly,
 * and our own finalize did not complete) and how to replay it, and until this
 * route nothing in production ever called it: `replayDeadLetters` had exactly
 * four callers, all of them tests. The webhook alarmed on the failed finalize
 * and left the row un-stamped, which is correct, and then the row sat there
 * until a human read the alarm. The stranded-payments sweep does NOT cover
 * this: it selects `payments.status = 'redirected'`, and a payment whose
 * finalize failed after verification has usually moved past that.
 *
 * Replay is safe to run every ten minutes for the same reasons the module
 * states: `finalizeOrder` is idempotent on `paid_at`, nothing here re-charges
 * anything, and a row only leaves the queue when a finalize actually succeeds.
 *
 * A dead letter with no `payment_id` cannot be replayed and needs a person; it
 * is alarmed once per sweep and keeps its place in the queue, which is what
 * keeps it visible.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, same as the
 * other ten.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  const results = await replayDeadLetters(admin, async (paymentId) => {
    // The queue row carries the payment id; the order and the deal number are
    // read off the payment, which is the row the webhook verified.
    const { data: payment, error } = await admin
      .from('payments')
      .select('id, order_id, cardcom_transaction_id')
      .eq('id', paymentId)
      .maybeSingle()
    if (error) return { ok: false, error: `payment read failed: ${error.message}` }
    if (!payment) return { ok: false, error: 'payment row missing for dead letter' }
    const result = await finalizeOrder({
      orderId: payment.order_id,
      paymentId: payment.id,
      transactionId: payment.cardcom_transaction_id ?? null,
      now: new Date(),
    })
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  })

  if (results.length > 0) {
    // Journalled only when the sweep found something: an empty queue every ten
    // minutes is the normal state and not an event.
    await recordPaymentEvent({
      eventType: 'dlq_replay_started',
      stage: 'webhook_dlq_sweep',
      detail: { queued: results.length },
    })
  }

  let replayed = 0
  let failed = 0
  let unreplayable = 0

  for (const { event, ok, error } of results) {
    if (ok) {
      replayed++
      // Loud on purpose, like `stranded.rescued`: every replayed letter is a
      // finalize that failed after a verified charge, and a rising count is a
      // problem no other signal reports.
      log.error('webhook_dlq.replayed', {
        eventId: event.id,
        externalEventId: event.externalEventId,
        paymentId: event.paymentId,
      })
      continue
    }
    if (!event.paymentId) {
      unreplayable++
      await capturePaymentAlarm('dead letter has no payment id and needs a person', {
        stage: 'webhook_dlq_sweep',
        detail: { event_id: event.id, external_event_id: event.externalEventId },
      })
      continue
    }
    failed++
    log.error('webhook_dlq.replay_failed', {
      eventId: event.id,
      paymentId: event.paymentId,
      reason: error ?? 'unknown',
    })
  }

  return NextResponse.json({ ok: true, considered: results.length, replayed, failed, unreplayable })
}

export const GET = withRequestLog('/api/cron/webhook-dlq', handleGET)
