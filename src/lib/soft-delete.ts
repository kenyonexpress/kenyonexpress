/**
 * Soft delete, in one place.
 *
 * RLS already hides a soft-deleted row from anon and authenticated readers,
 * but 75 files read through `createAdminClient()`, and the service role
 * bypasses RLS entirely. Those call sites need the predicate in code, and
 * "in code" has to mean one module, or the filter ends up half-adopted the
 * way `orFail` documents for catalogue error handling.
 *
 * TWO SETS, NOT ONE, because production can be behind the migration chain.
 * Filtering on a column Postgres does not have fails the whole query with
 * 42703 (see `optional-columns.ts` for the history of that failure mode). So:
 *
 *   - `SOFT_DELETE_LIVE_TABLES` carry `deleted_at` in production.
 *     `excludeDeleted` filters on them.
 *   - `SOFT_DELETE_PENDING_TABLES` would name tables whose column is still
 *     only in an unapplied migration, and `excludeDeleted` is deliberately a
 *     no-op for those. It is EMPTY as of 2026-09-09: 185 was applied that
 *     day, so `categories`, `product_images`, `reviews` and `wishlists`
 *     moved into the live list and every call site turned on in that one
 *     edit. The set stays because the next migration that adds `deleted_at`
 *     to a table needs somewhere to name it between writing and applying.
 *
 * The list order is alphabetical and the two sets must stay disjoint; a
 * drift test checks both against `src/types/database.ts`, which mirrors
 * production. (185 was numbered 149 until 2026-09-09, when production turned
 * out to have spent 149 on a different migration.)
 *
 * WHERE NOT TO USE IT. Post-sale reads on the money path (invoice line
 * names, finalize's fulfillment reads, gift-voucher emails, subscription
 * name lookups) must keep reading soft-deleted rows: an order's paper trail
 * survives a later catalogue deletion. Those call sites carry a comment
 * naming this module instead of a call to it.
 */

export const SOFT_DELETE_LIVE_TABLES = [
  'affiliates',
  'categories',
  'coupon_deals',
  'order_items',
  'orders',
  'product_images',
  'product_variants',
  'products',
  'referrals',
  'reviews',
  'suppliers',
  'user_addresses',
  'vendors',
  'wishlists',
] as const

/** Empty since 185 was applied on 2026-09-09. See the module header. */
export const SOFT_DELETE_PENDING_TABLES = [] as const

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
