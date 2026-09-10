'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeForReplay } from '@/server/payments/replay-finalize'
import { forceReplayDeadLetter } from '@/server/payments/webhook-dlq'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Requeueing something that gave up.
 *
 * THREE QUEUES, ONE SCREEN, BECAUSE THEY FAIL FOR THE SAME REASONS. The
 * notification outbox, the invoice queue and the search index DLQ each stop
 * after five attempts and each parks a row nobody looks at. Three separate
 * admin pages would mean three places to forget.
 *
 * A RETRY RESETS THE COUNTER, WHICH IS THE POINT. A `dead` row has spent its
 * five attempts; putting it back as `pending` without zeroing `attempts` would
 * make it die again on the first try, which looks like the retry did nothing.
 *
 * THE ERROR IS KEPT, NOT CLEARED. `last_error` is why an operator pressed the
 * button, and clearing it on requeue destroys the only evidence of what went
 * wrong if the retry fails differently.
 *
 * THE FOURTH QUEUE IS NOT A COUNTER RESET, AND THAT IS THE WHOLE DIFFERENCE.
 * The other three park a row that a drain will pick up again once `status` and
 * `attempts` say it may. A Cardcom dead letter has no drain waiting on it: the
 * row is stuck because `finalizeOrder` failed, and the only thing that clears
 * it is running that finalize again, here, inside the request. So this button
 * closes an order and splits money, which is why it asks for `payments` write
 * and not the `analytics` write the other three ask for.
 *
 * WRITTEN WITH THE ADMIN CLIENT, unlike the popular-searches editor next door,
 * and the difference is deliberate: these tables have no staff-write RLS policy
 * at all. Nothing but the server may move a queue row, because a queue an
 * authenticated user could edit is a queue an authenticated user could use to
 * make the system send mail.
 */

const QUEUES = ['notifications', 'invoices', 'search_index', 'payment_webhook'] as const
export type DeadLetterQueue = (typeof QUEUES)[number]

const retrySchema = z.object({
  queue: z.enum(QUEUES),
  id: z.string().uuid(),
})

export type DeadLetterState = { error: string } | { success: string } | null

/** Which table and which columns each queue resets. */
const QUEUE_SHAPE: Record<
  Exclude<DeadLetterQueue, 'payment_webhook'>,
  { table: string; reset: Record<string, unknown> }
> = {
  notifications: {
    table: 'notification_outbox',
    reset: { status: 'pending', attempts: 0, next_attempt_at: new Date(0).toISOString() },
  },
  invoices: {
    table: 'invoices',
    reset: { status: 'pending', attempts: 0, next_attempt_at: new Date(0).toISOString() },
  },
  search_index: {
    table: 'search_index_dlq',
    reset: { attempts: 0 },
  },
}

async function runRetry(_: DeadLetterState, formData: FormData): Promise<DeadLetterState> {
  const parsedQueue = formData.get('queue')

  // The gate is chosen BEFORE the queue is trusted, from the raw field, and an
  // unrecognised value takes the stricter branch. Reading the section off a
  // parsed value would be fine today and would silently downgrade the day a
  // fifth money queue is added to the enum and not to this line.
  const session =
    parsedQueue === 'payment_webhook' || !QUEUES.includes(parsedQueue as DeadLetterQueue)
      ? await requireSection('payments', 'write')
      : await requireSection('analytics', 'write')

  const parsed = retrySchema.safeParse({
    queue: parsedQueue,
    id: formData.get('id'),
  })
  if (!parsed.success) return { error: 'בקשה לא תקינה' }

  const admin = createAdminClient()

  if (parsed.data.queue === 'payment_webhook') {
    const outcome = await forceReplayDeadLetter(admin, parsed.data.id, finalizeForReplay(admin), {
      id: session.userId,
      role: session.role,
    })

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'manual_override',
      entityType: 'payment_webhook_events',
      entityId: parsed.data.id,
      // The outcome is part of the audit row, not just the intent. A replay
      // that failed is exactly the one a later reader needs to see attempted.
      metadata: {
        queue: 'payment_webhook',
        action: 'replay',
        ok: outcome.ok,
        error: outcome.error ?? null,
      },
    })

    revalidatePath('/admin/queues')
    return outcome.ok ? { success: 'ההזמנה נסגרה' } : { error: outcome.error ?? 'הניסיון נכשל' }
  }

  const shape = QUEUE_SHAPE[parsed.data.queue]

  // `next_attempt_at` in the past rather than `now()`: the drains select rows
  // whose deadline has passed, and a value written a millisecond in the future
  // would make the row wait a whole cron cycle for no reason.
  const { error } = await admin.from(shape.table).update(shape.reset).eq('id', parsed.data.id)

  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: shape.table,
    entityId: parsed.data.id,
    metadata: { queue: parsed.data.queue, action: 'requeue' },
  })

  revalidatePath('/admin/queues')
  return { success: 'הוחזר לתור' }
}

export async function retryDeadLetter(
  state: DeadLetterState,
  formData: FormData,
): Promise<DeadLetterState> {
  return withActionContext('admin.dead_letter_retry', () => runRetry(state, formData))
}
