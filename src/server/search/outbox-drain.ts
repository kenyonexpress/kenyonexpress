import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import {
  type OutboxJobRow,
  pendingOutboxRpc,
  pendingOutboxTable,
} from '@/lib/supabase/pending-outbox'

/**
 * Drains `search_index_outbox`: the durable floor migration 132 laid under the
 * webhook fast path. The trigger has been writing rows in production since the
 * migration was applied; until this module, nothing ever read them, so a lost
 * webhook really was a lost reindex — the exact failure the outbox exists to
 * absorb.
 *
 * One sweep: claim a batch (claim_search_index_jobs is SKIP LOCKED, so
 * concurrent sweeps never double-run a row), run one index job per product,
 * and stamp the outcome back. A burst of edits leaves many rows for the same
 * product; the worker re-reads the row from Postgres anyway, so one run
 * settles all of them and they are all stamped with its outcome.
 */

export const OUTBOX_BATCH = 50

/**
 * Exponential backoff in minutes, from the attempt count the claim already
 * incremented: 2, 4, 8, ... capped at six hours. Rows are never dropped —
 * one row per product edit is cheap, and an undone row is the only record
 * that the index is behind.
 */
export function backoffMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(attempts, 1), 360)
}

type QueryError = { message: string } | null

/** The slice of the admin client the drain touches, faked in tests. */
export type OutboxClient = {
  rpc: (fn: never, args?: never) => PromiseLike<{ data: unknown; error: QueryError }>
  from: (table: never) => {
    update: (values: never) => {
      in: (column: string, ids: number[]) => PromiseLike<{ error: QueryError }>
    }
  }
}

export interface DrainSummary {
  claimed: number
  /** Products (not rows) whose job ran to completion. */
  succeeded: number
  /** Products whose job threw; their rows got last_error and a backoff. */
  failed: number
  errors: string[]
}

/**
 * Rows grouped per product, the NEWEST row's op deciding the job. Ordering
 * matters only for that choice: an upsert enqueued after a delete means the
 * product came back, and vice versa. Either way the worker re-reads the truth
 * before touching the index, so the op is a hint, not a claim.
 */
function groupByProduct(rows: OutboxJobRow[]): Map<string, OutboxJobRow[]> {
  const byProduct = new Map<string, OutboxJobRow[]>()
  for (const row of rows) {
    const group = byProduct.get(row.product_id) ?? []
    group.push(row)
    byProduct.set(row.product_id, group)
  }
  return byProduct
}

function newestFirst(a: OutboxJobRow, b: OutboxJobRow): number {
  return new Date(b.enqueued_at).getTime() - new Date(a.enqueued_at).getTime()
}

export async function drainSearchOutbox(
  admin: OutboxClient,
  runJob: (job: SearchIndexJob) => Promise<string>,
  now: Date = new Date(),
): Promise<DrainSummary> {
  const { data, error } = await admin.rpc(pendingOutboxRpc('claim_search_index_jobs'), {
    p_limit: OUTBOX_BATCH,
  } as never)
  if (error) {
    return { claimed: 0, succeeded: 0, failed: 0, errors: [`claim failed: ${error.message}`] }
  }

  const rows = Array.isArray(data) ? (data as OutboxJobRow[]) : []
  const summary: DrainSummary = { claimed: rows.length, succeeded: 0, failed: 0, errors: [] }

  for (const [productId, group] of groupByProduct(rows)) {
    const newest = [...group].sort(newestFirst)[0] as OutboxJobRow
    const ids = group.map((row) => row.id)

    let outcome: { ok: true } | { ok: false; message: string }
    try {
      await runJob({
        op: newest.op,
        productId,
        reason: 'outbox-drain',
        enqueuedAt: new Date(newest.enqueued_at).toISOString(),
      })
      outcome = { ok: true }
    } catch (cause) {
      outcome = { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
    }

    // The stamp is per ROW but the outcome is per PRODUCT: every claimed row
    // for the product is settled (or retried) by the one job that ran.
    const attempts = Math.max(...group.map((row) => row.attempts))
    const values = outcome.ok
      ? { done_at: now.toISOString() }
      : {
          last_error: outcome.message.slice(0, 500),
          next_try_at: new Date(now.getTime() + backoffMinutes(attempts) * 60_000).toISOString(),
        }
    const { error: stampError } = await admin
      .from(pendingOutboxTable('search_index_outbox'))
      .update(values as never)
      .in('id', ids)

    if (outcome.ok) summary.succeeded += 1
    else {
      summary.failed += 1
      summary.errors.push(`${productId}: ${outcome.message}`)
    }
    // A failed stamp leaves the row claimed-but-undone; the next sweep's claim
    // picks it up again once COALESCE(next_try_at, enqueued_at) passes. Loud in
    // the summary so a broken stamp path cannot stay a silent re-run loop.
    if (stampError) summary.errors.push(`stamp failed for ${productId}: ${stampError.message}`)
  }

  return summary
}
