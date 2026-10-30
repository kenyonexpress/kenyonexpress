'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
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
 * WRITTEN WITH THE ADMIN CLIENT, unlike the popular-searches editor next door,
 * and the difference is deliberate: these tables have no staff-write RLS policy
 * at all. Nothing but the server may move a queue row, because a queue an
 * authenticated user could edit is a queue an authenticated user could use to
 * make the system send mail.
 */

const QUEUES = ['notifications', 'invoices', 'search_index'] as const
export type DeadLetterQueue = (typeof QUEUES)[number]

const retrySchema = z.object({
  queue: z.enum(QUEUES),
  id: z.string().uuid(),
})

export type DeadLetterState = { error: string } | { success: string } | null

/** Which table and which columns each queue resets. */
const QUEUE_SHAPE: Record<DeadLetterQueue, { table: string; reset: Record<string, unknown> }> = {
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
  const session = await requireSection('analytics', 'write')

  const parsed = retrySchema.safeParse({
    queue: formData.get('queue'),
    id: formData.get('id'),
  })
  if (!parsed.success) return { error: 'בקשה לא תקינה' }

  const shape = QUEUE_SHAPE[parsed.data.queue]
  const admin = createAdminClient()

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
