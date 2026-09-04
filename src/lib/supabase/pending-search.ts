/**
 * The `search_products` RPC migration 171 adds, typed here because it is not
 * in `src/types/database.ts` yet.
 *
 * Same pattern and same deletion point as pending-reports.ts (170) and
 * pending-schema.ts (135): the shape lives HERE, next to the one cast that
 * names it, instead of leaking `as never` through the call sites.
 *
 * 171 WAS applied to production on 2026-09-04 (MCP, `search_fts_171`), so the
 * RPC exists and works there at runtime: a GIN-indexed tsvector
 * (config `simple` + unaccent, Hebrew indexed as typed) over
 * name/brand/tags/descriptions, prefix-matched and ts_rank-ordered,
 * SECURITY INVOKER so the caller's own RLS decides what it can see.
 *
 * WHEN database.ts IS REGENERATED: delete this file and call
 * `supabase.rpc('search_products', ...)` directly. The column names here are
 * the column names in the migration.
 *
 * Until then every caller must assume the call can fail with "function does
 * not exist" (a local or preview database without 171) and fall back to the
 * stage-1 ILIKE path rather than showing an empty result page.
 */

/** Row of public.search_products(q, max_results, product_type, category). */
export interface PendingSearchProductRow {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  category_name_he: string | null
  category_slug: string | null
  rank: number
}

/** Arguments of public.search_products; all but `q` are optional in SQL. */
export interface SearchProductsArgs {
  q: string
  max_results: number
  product_type?: 'coupon' | 'physical'
  category?: string
}

/**
 * Names the RPC the generated types do not have, for `.rpc()`. The cast is
 * confined to this one expression, the way `pendingReportRpc` confines it.
 */
export function pendingSearchRpc(name: 'search_products'): never {
  return name as never
}

/**
 * Runs the search RPC and types its rows.
 *
 * Returns `{ missing: true }` rather than throwing when the function is
 * absent, so the caller can drop to the ILIKE fallback on a database without
 * migration 171. Any other error is returned as-is for the caller to log.
 */
export async function callSearchProductsRpc(
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<
  | { ok: true; rows: PendingSearchProductRow[] }
  | { ok: false; missing: true }
  | { ok: false; missing: false; message: string }
> {
  const { data, error } = await run()

  if (error) {
    if (isMissingSearchRpc(error)) return { ok: false, missing: true }
    return { ok: false, missing: false, message: error.message ?? 'unknown error' }
  }

  return { ok: true, rows: Array.isArray(data) ? (data as PendingSearchProductRow[]) : [] }
}

/**
 * Whether a PostgREST error is "migration 171 has not been applied" rather
 * than a real failure. 42883 is Postgres's undefined_function and PGRST202 is
 * PostgREST's "could not find the function in the schema cache"; which one
 * surfaces depends on whether the schema cache has been reloaded.
 *
 * The distinction matters for the same reason it does in pending-reports.ts:
 * "this database has no FTS yet, use ILIKE" and "the search failed" must not
 * take the same branch, or a real outage silently halves search quality.
 */
export function isMissingSearchRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('search_products') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
