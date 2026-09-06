/**
 * Soft delete, in one place.
 *
 * RLS already hides a soft-deleted row from anon and authenticated readers,
 * but 75 files read through `createAdminClient()`, and the service role
 * bypasses RLS entirely. Those call sites need the predicate in code, and
 * "in code" has to mean one module, or the filter ends up half-adopted the
 * way `orFail` documents for catalogue error handling.
 *
 * TWO SETS, NOT ONE, because production is behind the migration chain.
 * Filtering on a column Postgres does not have fails the whole query with
 * 42703 (see `optional-columns.ts` for the history of that failure mode). So:
 *
 *   - `SOFT_DELETE_LIVE_TABLES` carry `deleted_at` in production, measured
 *     2026-09-04 via information_schema over MCP. `excludeDeleted` filters.
 *   - `SOFT_DELETE_PENDING_TABLES` gain the column only when
 *     `migrations/pending/149_soft_delete_user_facing_remainder.sql` is
 *     applied. Until then `excludeDeleted` is deliberately a no-op for them.
 *     After 149 is applied, move the four names into the live list; every
 *     call site turns on in that one edit. A drift test pins these four to
 *     the tables 149 actually alters.
 *
 * WHERE NOT TO USE IT. Post-sale reads on the money path (invoice line
 * names, finalize's fulfillment reads, gift-voucher emails, subscription
 * name lookups) must keep reading soft-deleted rows: an order's paper trail
 * survives a later catalogue deletion. Those call sites carry a comment
 * naming this module instead of a call to it.
 */

export const SOFT_DELETE_LIVE_TABLES = [
  'affiliates',
  'coupon_deals',
  'order_items',
  'orders',
  'product_variants',
  'products',
  'referrals',
  'suppliers',
  'user_addresses',
  'vendors',
] as const

export const SOFT_DELETE_PENDING_TABLES = [
  'categories',
  'product_images',
  'reviews',
  'wishlists',
] as const

export type SoftDeleteLiveTable = (typeof SOFT_DELETE_LIVE_TABLES)[number]
export type SoftDeletePendingTable = (typeof SOFT_DELETE_PENDING_TABLES)[number]
export type SoftDeleteTable = SoftDeleteLiveTable | SoftDeletePendingTable

const pending: ReadonlySet<string> = new Set(SOFT_DELETE_PENDING_TABLES)

/**
 * Appends `deleted_at is null` to a Supabase query on a soft-deletable table.
 *
 * The generic is unconstrained and the `is` call is reached through a
 * structural cast, for the same reason `optional-columns.ts` takes thunks:
 * constraining against the query-builder generics blows the instantiation
 * depth limit (TS2589). `.is()` returns the same builder, so handing back `Q`
 * is truthful.
 */
export function excludeDeleted<Q>(query: Q, table: SoftDeleteTable): Q {
  if (pending.has(table)) return query
  return (query as { is(column: string, value: null): unknown }).is('deleted_at', null) as Q
}
