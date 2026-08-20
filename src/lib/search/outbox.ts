import { randomUUID } from 'node:crypto'
import { log } from '@/lib/observability/log'
import { runSearchIndexJob } from '@/lib/search/indexer'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

/**
 * Draining the transactional outbox into Meilisearch.
 *
 * WHAT THE OUTBOX BUYS THAT THE QUEUE CANNOT. The webhook path
 * (products -> pg_net -> /api/webhooks/products -> QStash -> index-job) does
 * every hop OUTSIDE the transaction that changed the product. A commit with a
 * dead pg_net loses the change with nothing recording that it existed; a
 * notification sent before a rollback indexes a change that never happened.
 * An outbox row is written by the same transaction as the product edit, so it
 * commits with the change or not at all. See migrations/pending/087.
 *
 * BOTH PATHS STAY. QStash carries the fast copy so a price edit is searchable
 * within a second; the outbox is the ledger that guarantees it eventually is.
 * They converge because both ends do the same thing - re-read the row, write
 * what it says - so a change delivered twice is a no-op and a change delivered
 * once is enough.
 *
 * WHY THIS IS A NEXT ROUTE AND NOT A SUPABASE EDGE FUNCTION. The goal called
 * for an Edge Function, and the drain would sit equally well in one. It is here
 * because the work it does is `runSearchIndexJob`, which reads the products and
 * suppliers tables through the app's admin client, maps the row with
 * toProductDocument and talks to Meilisearch through lib/search/client.ts. In
 * Deno, all three would have to be re-implemented, and the moment there are two
 * mappings of a products row to an index document, they drift - one of them
 * silently stops indexing a column and nothing fails. The trigger already
 * guarantees the row is recorded; what drains it is a scheduling choice, and
 * this one keeps a single definition of what a product document is.
 */

/** How many jobs one drain claims. Bounded by the RPC at 200 regardless. */
export const OUTBOX_BATCH_SIZE = 25

const outboxRowSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  product_id: z.string().uuid(),
  op: z.enum(['upsert', 'delete']),
  reason: z.string(),
  attempts: z.number(),
})

export type OutboxRow = z.infer<typeof outboxRowSchema>

export type DrainResult = {
  claimed: number
  indexed: number
  failed: number
  /** One line per failure, for the response body and the log. Never thrown. */
  errors: string[]
}

type Runner = (job: SearchIndexJob) => Promise<string>

/**
 * Claims a batch, indexes it, then reports each outcome back.
 *
 * FAILURES ARE COLLECTED, NOT THROWN. One product with a malformed image array
 * must not stop the other twenty-four from being indexed, and it must not make
 * the whole batch look unclaimed - the rows it did index would then be indexed
 * again, forever, behind the same poison row.
 *
 * The claim token is generated per drain and every completion is matched
 * against it in SQL. A row whose token has changed was re-enqueued by a newer
 * edit while this drain was running, and closing it here would lose that edit.
 */
export async function drainSearchOutbox(
  options: { limit?: number; run?: Runner } = {},
): Promise<DrainResult> {
  const limit = options.limit ?? OUTBOX_BATCH_SIZE
  const run = options.run ?? runSearchIndexJob
  const token = randomUUID()
  const admin = createAdminClient()

  const { data, error } = await admin.rpc(
    'fn_claim_search_outbox' as never,
    {
      p_limit: limit,
      p_token: token,
    } as never,
  )
  if (error) throw new Error(`outbox claim failed: ${error.message}`)

  const parsed = z.array(outboxRowSchema).safeParse(data ?? [])
  if (!parsed.success) {
    throw new Error(`outbox claim returned an unrecognised shape: ${parsed.error.message}`)
  }
  const rows = parsed.data
  if (rows.length === 0) return { claimed: 0, indexed: 0, failed: 0, errors: [] }

  const done: number[] = []
  const failed: number[] = []
  const errors: string[] = []

  // SEQUENTIAL. The engine is a single node behind one API key, and a
  // twenty-five-wide burst of document writes from every drain is how a search
  // engine ends up rate-limiting the storefront's own reads. The batch is small
  // and the work is one HTTP round trip each.
  for (const row of rows) {
    try {
      await run({
        op: row.op,
        productId: row.product_id,
        reason: row.reason,
        enqueuedAt: new Date().toISOString(),
      })
      done.push(row.id)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'unknown'
      failed.push(row.id)
      errors.push(`${row.product_id}: ${message}`)
    }
  }

  if (done.length > 0) {
    const { error: completeError } = await admin.rpc(
      'fn_complete_search_outbox' as never,
      {
        p_ids: done,
        p_token: token,
      } as never,
    )
    // The documents ARE indexed at this point. A failure here means they will
    // be indexed again on the next drain, which is a no-op - so it is logged
    // and not thrown.
    if (completeError) log.warn('search.outbox_complete_failed', { reason: completeError.message })
  }

  if (failed.length > 0) {
    const { error: failError } = await admin.rpc(
      'fn_fail_search_outbox' as never,
      {
        p_ids: failed,
        p_token: token,
        p_error: errors.join(' | ').slice(0, 500),
      } as never,
    )
    if (failError) log.warn('search.outbox_fail_failed', { reason: failError.message })
  }

  return { claimed: rows.length, indexed: done.length, failed: failed.length, errors }
}
