/**
 * Types for `search_index_outbox` and `claim_search_index_jobs`, which
 * migration 132 adds and `src/types/database.ts` does not know yet.
 *
 * Same pattern and same deletion point as pending-search.ts (171) and
 * pending-reports.ts (170): the shape lives HERE, next to the one cast that
 * names it, instead of leaking `as never` through the call sites.
 *
 * 132 IS applied to production (table, trigger and claim function all verified
 * live on 2026-09-09), so at runtime the objects exist there. A local or
 * preview database without 132 answers "relation does not exist", which the
 * drain reports as a failed sweep rather than crashing the route.
 *
 * WHEN database.ts IS REGENERATED: delete this file and use the generated
 * types directly. The column names here are the column names in the migration.
 */

/** Row of public.search_index_outbox, as claim_search_index_jobs returns it. */
export interface OutboxJobRow {
  id: number
  product_id: string
  op: 'upsert' | 'delete'
  enqueued_at: string
  claimed_at: string | null
  done_at: string | null
  /** Already incremented by the claim that returned this row. */
  attempts: number
  last_error: string | null
  next_try_at: string | null
}

/**
 * Names the RPC the generated types do not have, for `.rpc()`. The cast is
 * confined to this one expression, the way `pendingSearchRpc` confines it.
 */
export function pendingOutboxRpc(name: 'claim_search_index_jobs'): never {
  return name as never
}

/** Names the table the generated types do not have, for `.from()`. */
export function pendingOutboxTable(name: 'search_index_outbox'): never {
  return name as never
}
