import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resurrecting email that gave up for a reason that was never the email's.
 *
 * THE OUTBOX DRAINER ALREADY RETRIES. `/api/cron/notifications` counts
 * attempts, backs each row off exponentially (2, 8, 32, 128 minutes) and
 * parks it `dead` after five. Five attempts span about three hours. A Resend
 * outage, a DNS blip or a rate limit that lasts an afternoon therefore kills
 * every row queued during it, and `dead` is then a state only an operator
 * can leave (`server/actions/admin/dead-letters.ts`), on a screen nobody has
 * been reading. This is the automatic half of that button.
 *
 * WHAT IT WILL AND WILL NOT RESURRECT. Only rows whose `last_error` names a
 * transient cause: a 5xx or 429 from the provider, or a network failure. A
 * row dead for `no template for kind` will never render however often it is
 * tried, and a 4xx other than 429 is the request being wrong, not the moment.
 * Those stay dead for the operator.
 *
 * BOUNDED WITHOUT A NEW COLUMN. A resurrected row gets `attempts = 3`, so it
 * has two more tries at the long end of the backoff before it is dead again,
 * and only rows created in the last three days are eligible. A row can be
 * resurrected at most once per run and the run is four times a day, so the
 * worst case is a dozen extra attempts over three days and then silence. The
 * counter is not reset to zero on purpose: a row that has now failed seven
 * times should not look like one that never ran.
 *
 * `last_error` IS KEPT. It is the reason the row died, and clearing it would
 * destroy the only evidence of what went wrong if the retry fails differently.
 *
 * ONLY THE EMAIL LEG. The push leg (`push_status`) dies when a device is
 * unreachable, which is not transient in the same sense, and
 * `lib/push/dispatch.ts` owns that lifecycle.
 */

/** How far back a dead row may date from and still be worth another go. */
export const RESURRECT_MAX_AGE_DAYS = 3

/**
 * The attempt count a resurrected row restarts from. `MAX_ATTEMPTS` in the
 * drainer is 5, so this buys exactly two more tries.
 */
export const RESURRECT_ATTEMPTS = 3

/** Ceiling per run. A larger backlog drains over consecutive runs. */
export const RESURRECT_BATCH = 200

const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /^http_5\d\d$/,
  /^http_429$/,
  /^network$/,
  /timeout|timed out/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE/,
  /fetch failed/i,
]

/** Whether a drainer `last_error` describes a failure that time can fix. */
export function isTransientSendError(reason: string | null | undefined): boolean {
  if (!reason) return false
  const trimmed = reason.trim()
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export interface DeadOutboxRow {
  id: string
  kind: string
  last_error: string | null
  created_at: string
}

export interface ResurrectPlan {
  /** Ids to put back to `pending`. */
  requeue: string[]
  /** Rows whose error is not transient; left for the operator. */
  permanent: number
}

/**
 * Splits the dead rows the query returned into the ones worth another try and
 * the ones that are not. Pure, so the rule is testable without a database.
 * Age is enforced in the query as well; it is re-checked here so that a
 * caller handing in rows from elsewhere gets the same answer.
 */
export function planResurrection(rows: readonly DeadOutboxRow[], now: Date): ResurrectPlan {
  const cutoff = now.getTime() - RESURRECT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const requeue: string[] = []
  let permanent = 0
  for (const row of rows) {
    if (Date.parse(row.created_at) < cutoff) continue
    if (isTransientSendError(row.last_error)) requeue.push(row.id)
    else permanent++
  }
  return { requeue, permanent }
}

export interface ResurrectSummary {
  /** Dead rows within the age window that the query returned. */
  scanned: number
  /** Rows put back to `pending`. */
  requeued: number
  /** Rows left dead because their error is not transient. */
  permanent: number
}

/**
 * Reads the recent dead rows, decides, and writes the decision as one UPDATE.
 * Throws on a failed read or write so the route can answer 500 and the
 * scheduler retries; there is no partial state to protect, since a row is
 * either `dead` or `pending` and both are states the drainer understands.
 */
export async function resurrectDeadEmails(
  admin: SupabaseClient,
  now: Date,
): Promise<ResurrectSummary> {
  const since = new Date(now.getTime() - RESURRECT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id, kind, last_error, created_at')
    .eq('status', 'dead')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(RESURRECT_BATCH)
  if (error) throw new Error(`dead outbox read failed: ${error.message}`)

  const rows = (data ?? []) as unknown as DeadOutboxRow[]
  const plan = planResurrection(rows, now)
  if (plan.requeue.length === 0) {
    return { scanned: rows.length, requeued: 0, permanent: plan.permanent }
  }

  const { error: writeError } = await admin
    .from('notification_outbox')
    .update({
      status: 'pending',
      attempts: RESURRECT_ATTEMPTS,
      next_attempt_at: now.toISOString(),
    })
    .in('id', plan.requeue)
    .eq('status', 'dead')
  if (writeError) throw new Error(`dead outbox requeue failed: ${writeError.message}`)

  return { scanned: rows.length, requeued: plan.requeue.length, permanent: plan.permanent }
}
