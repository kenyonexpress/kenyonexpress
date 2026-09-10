import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeForReplay } from '@/server/payments/replay-finalize'
import { DLQ_ALERT_DEPTH, sweepDeadLetters } from '@/server/payments/webhook-dlq'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The dead-letter sweep: money that moved, and an order that never closed.
 *
 * WHY THIS IS NOT `stranded-payments` AGAIN. That job is for the webhook that
 * never arrived - it asks Cardcom whether a `redirected` payment actually
 * charged. This one is for the webhook that DID arrive, that we DID verify
 * against Cardcom's API, and whose finalize then failed. Different evidence,
 * different failure, and only one of them leaves a row in
 * `payment_webhook_events` with `verified_against_api = true` and
 * `processed_at` still null.
 *
 * AND IT MUST NOT SHARE THAT ROUTE'S `checkoutEnabled` SKIP. `stranded-payments`
 * correctly does nothing without Cardcom credentials, because its whole first
 * step is to call the provider. This sweep calls nobody: the charge is already
 * verified and all that is left is our own `finalizeOrder`. Folding it in would
 * have made the queue undrainable on exactly the machines whose credentials
 * were the reason finalize broke.
 *
 * `server/payments/webhook-dlq.ts` had NO CALLER before this file. The queue
 * was defined, tested and enumerable, and nothing ever ran it - the dominant
 * defect shape in this repository, and the worst possible place for it.
 *
 * WHY THE ALARM IS `capturePaymentAlarm` AND NOT A NEW OUTBOX KIND. The live
 * `notification_outbox_kind_check` carries seventeen kinds; a new one is a
 * 23514 at insert time until a migration is approved, which is where
 * `settlement_gap` has been sitting since 214. `capturePaymentAlarm` sends the
 * ntfy push OUTSIDE the Sentry DSN guard, so it is the one operator channel
 * measured to work on this deployment today.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

/** One sweep's ceiling. A backlog drains over consecutive runs. */
const BATCH = 25

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const finalize = finalizeForReplay(admin)

  const sweep = await sweepDeadLetters(admin, finalize, { limit: BATCH })

  for (const result of sweep.results) {
    // `waiting` is a row inside its backoff, which is the mechanism working.
    // Logging it as a failure would put a line per open event in the log every
    // ten minutes and teach whoever reads it that the line means nothing.
    if (result.status !== 'failed') continue
    log.error('webhook_dlq.replay_failed', {
      event_id: result.event.id,
      external_event_id: result.event.externalEventId,
      payment_id: result.event.paymentId,
      reason: result.error ?? null,
    })
  }

  // DEPTH, NOT FAILURES. One replay that failed is a retry doing its job; six
  // charged orders sitting open at once is the provider, the database or
  // finalize being broken for everybody, and the difference is only visible in
  // the count. Above the line it alerts on EVERY run, deliberately: this is the
  // one state in the system where money has moved and the customer has nothing,
  // and an alert that de-duplicates itself into silence is how that gets left
  // overnight.
  if (sweep.depth > DLQ_ALERT_DEPTH) {
    await capturePaymentAlarm('webhook dead-letter queue is deep', {
      stage: 'webhook_dlq_sweep',
      detail: {
        depth: sweep.depth,
        stuck: sweep.stuck,
        replayed: sweep.replayed,
        failed: sweep.failed,
        threshold: DLQ_ALERT_DEPTH,
      },
    })
  }

  if (sweep.stuck > 0) {
    // Nothing automatic will touch these again. The only thing that moves them
    // is somebody opening /admin/queues, so they are said out loud every run
    // rather than counted into a body the scheduler discards.
    log.error('webhook_dlq.stuck', { stuck: sweep.stuck, depth: sweep.depth })
  }

  return NextResponse.json({
    ok: true,
    depth: sweep.depth,
    replayed: sweep.replayed,
    succeeded: sweep.succeeded,
    failed: sweep.failed,
    stuck: sweep.stuck,
    waiting: sweep.waiting,
    unreplayable: sweep.unreplayable,
  })
}

export const GET = withRequestLog('/api/cron/webhook-dlq', withJobRun('webhook-dlq', handleGET))
