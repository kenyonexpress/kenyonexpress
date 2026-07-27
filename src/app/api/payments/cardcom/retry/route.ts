import {
  WEBHOOK_RETRY_MAX_ATTEMPTS,
  deadLetterWebhookRetry,
  enqueueWebhookRetry,
  popWebhookRetry,
  retryQueueDepth,
} from '@/lib/queue/webhook-retry'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendPaymentEvent } from '@/server/payments/events'
import { isRetriable, processCardcomLowProfile } from '@/server/payments/webhook-processing'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const BATCH_SIZE = 20

/**
 * Drains the webhook retry queue (Vercel Cron, Authorization: Bearer
 * CRON_SECRET, same contract as /api/cron/expire-vouchers).
 *
 * Each job re-runs the idempotent processing pipeline. Still-retriable
 * failures go back on the queue with attempt+1 until WEBHOOK_RETRY_MAX_ATTEMPTS,
 * then to the dead-letter list plus an audit_log alarm; a job whose payment
 * meanwhile reached a final state simply drains as done.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const outcomes: Array<{ lowProfileId: string; attempt: number; status: string }> = []

  for (let i = 0; i < BATCH_SIZE; i += 1) {
    const job = await popWebhookRetry()
    if (!job) break

    const result = await processCardcomLowProfile(job.lowProfileId, 'retry-queue')
    outcomes.push({ lowProfileId: job.lowProfileId, attempt: job.attempt, status: result.status })

    if (result.status === 'finalized') {
      await appendPaymentEvent(admin, {
        orderId: result.orderId,
        eventType: 'webhook_retry_processed',
        idempotencyKey: `webhook:${job.externalEventId}:processed`,
        actor: 'retry-queue',
        metadata: { attempt: job.attempt, replay: result.replay },
      })
      await admin
        .from('payment_webhook_events')
        .update({ verified_against_api: true, processed_at: new Date().toISOString() })
        .eq('provider', 'cardcom')
        .eq('external_event_id', job.externalEventId)
      continue
    }

    if (!isRetriable(result)) continue // final non-success: reconcile/refund owns it

    if (job.attempt >= WEBHOOK_RETRY_MAX_ATTEMPTS) {
      await deadLetterWebhookRetry(job)
      // audit_log.entity_id is NOT NULL, so the alarm anchors to the payment
      // row when one exists; the dead-letter list itself is the durable record.
      const { data: payment } = await admin
        .from('payments')
        .select('id')
        .eq('cardcom_low_profile_id', job.lowProfileId)
        .maybeSingle()
      if (payment) {
        await admin.from('audit_log').insert({
          actor_id: null,
          actor_role: null,
          action: 'manual_override',
          entity_type: 'payment',
          entity_id: payment.id,
          changes: {} as Json,
          metadata: {
            alarm: 'webhook_retry_exhausted',
            low_profile_id: job.lowProfileId,
            external_event_id: job.externalEventId,
            attempts: job.attempt,
            last_status: result.status,
          } as unknown as Json,
        })
      }
      continue
    }

    await enqueueWebhookRetry({
      provider: 'cardcom',
      lowProfileId: job.lowProfileId,
      externalEventId: job.externalEventId,
      attempt: job.attempt + 1,
    })
  }

  const depth = await retryQueueDepth()
  return NextResponse.json({ ok: true, processed: outcomes, queue: depth })
}
