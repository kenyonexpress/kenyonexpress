import 'server-only'

import { log } from '@/lib/observability/log'
import { runSearchIndexJob } from '@/lib/search/indexer'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The drain for `search_index_outbox` (marathon step 9).
 *
 * 132 built the whole floor -- the in-transaction trigger, the SKIP LOCKED
 * claim function, the eligibility index -- and nothing in src/ ever called
 * it. The QStash webhook remained the ONLY transport, which means a product
 * changed while the webhook endpoint was down was a product the index never
 * heard about again. This module is the missing consumer.
 *
 * THE BACKOFF LADDER LIVES HERE, NOT IN THE CLAIM. `claim_search_index_jobs`
 * counts the attempt and hands the row over; what happens on failure is this
 * module writing `next_try_at = now() + ladder(attempts)`, which is exactly
 * the column the eligibility scan orders by. A row that keeps failing walks
 * 2 -> 8 -> 32 -> 128 -> 512 minutes and then stays at the cap: search
 * indexing has no five-strikes death, because unlike an email, the index
 * catching up late is strictly better than never.
 */

/** 2, 8, 32, 128, then capped: a wedged Meilisearch is retried ~3x a day, forever. */
export const BACKOFF_CAP_MINUTES = 512

export function searchBackoffMinutes(attempts: number): number {
  return Math.min(2 * 4 ** Math.max(0, attempts - 1), BACKOFF_CAP_MINUTES)
}

type OutboxJob = {
  id: number
  product_id: string
  op: string
  attempts: number
}

export type DrainResult = {
  claimed: number
  done: number
  failed: number
  /**
   * Rows still waiting, whether or not this run could touch any of them.
   *
   * WHY A FOURTH NUMBER. `{claimed: 0, done: 0, failed: 0}` is what an
   * unconfigured deploy returns and it is also what an empty queue returns,
   * and those are opposite facts. Production today is the first one:
   * `search_index_outbox` held 21 rows on 2026-09-09 and the health endpoint
   * reported three zeros, which reads as "nothing to do".
   *
   * That backlog is correct -- the comment below says to leave it, and it is
   * the replay stage 2 will run -- but "correct and 21" and "correct and
   * 21,000" are answered the same way by three zeros, and the first anyone
   * would learn of the difference is the day Meilisearch is switched on.
   *
   * `null` means the depth could not be read, which is again not zero.
   */
  pending: number | null
}

/**
 * How many rows are still owed to the index. Counted, never claimed: this runs
 * on the unconfigured path too, where claiming would mark rows done that no
 * index ever heard about.
 *
 * A count failure is not a drain failure. The caller gets `null` and the drain
 * carries on, because losing the depth reading must not cost the sweep.
 */
async function pendingDepth(admin: SupabaseClient): Promise<number | null> {
  const { count, error } = await admin
    .from('search_index_outbox')
    .select('id', { count: 'exact', head: true })
    .is('done_at', null)
  if (error) {
    log.warn('search.outbox_depth_failed', { reason: error.message })
    return null
  }
  return count ?? 0
}

/**
 * Claims up to `limit` eligible jobs and runs each through the same
 * `runSearchIndexJob` the webhook uses -- one executor, two transports.
 * A job failure never aborts the batch; each row settles independently.
 */
export async function drainSearchOutbox(admin: SupabaseClient, limit = 50): Promise<DrainResult> {
  // Claiming while Meilisearch is unconfigured would mark rows done that no
  // index ever heard about (the executor no-ops successfully). The rows ARE
  // the backlog stage 2 will replay; leave them.
  if (!process.env.MEILISEARCH_HOST || !process.env.MEILISEARCH_API_KEY) {
    return { claimed: 0, done: 0, failed: 0, pending: await pendingDepth(admin) }
  }

  const { data, error } = await admin.rpc('claim_search_index_jobs', { p_limit: limit })
  if (error) throw new Error(`search outbox claim failed: ${error.message}`)

  const jobs = (data ?? []) as OutboxJob[]
  let done = 0
  let failed = 0

  for (const job of jobs) {
    try {
      await runSearchIndexJob({
        op: job.op === 'delete' ? 'delete' : 'upsert',
        productId: job.product_id,
      } as SearchIndexJob)
      done++
      const { error: doneError } = await admin
        .from('search_index_outbox')
        .update({ done_at: new Date().toISOString(), last_error: null })
        .eq('id', job.id)
      if (doneError) {
        // The index IS updated; only the bookkeeping failed. The job will be
        // re-claimed and re-run, and the executor is idempotent, so this is
        // noise worth logging rather than a failure worth counting.
        log.warn('search.outbox_done_write_failed', { id: job.id, reason: doneError.message })
      }
    } catch (err) {
      failed++
      const reason = err instanceof Error ? err.message : 'unknown'
      const minutes = searchBackoffMinutes(job.attempts)
      const { error: retryError } = await admin
        .from('search_index_outbox')
        .update({
          next_try_at: new Date(Date.now() + minutes * 60_000).toISOString(),
          last_error: reason.slice(0, 500),
        })
        .eq('id', job.id)
      if (retryError) {
        log.warn('search.outbox_retry_write_failed', { id: job.id, reason: retryError.message })
      }
      log.warn('search.outbox_job_failed', {
        id: job.id,
        product_id: job.product_id,
        attempts: job.attempts,
        retry_in_minutes: minutes,
        reason,
      })
    }
  }

  // Read AFTER the batch, so the number is what is still owed rather than what
  // was owed before this run started.
  return { claimed: jobs.length, done, failed, pending: await pendingDepth(admin) }
}
