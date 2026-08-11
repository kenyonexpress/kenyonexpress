/**
 * The tables PENDING-109 adds, typed here because they are not in
 * `src/types/database.ts` yet.
 *
 * `database.ts` is generated from production, and production has not had
 * PENDING-109 applied - that migration is Ofir's call, not this session's. So
 * `supabase.from('subscriptions')` does not type-check against the generated
 * Database, and it would not work at runtime either.
 *
 * Three ways to handle that, and why this is the one:
 *
 *   Casting the client to `any` at each call site loses every column name and
 *   every return type, which is how a typo in a select string becomes a
 *   silent undefined on a page rather than a compile error.
 *
 *   Hand-editing `database.ts` to add the tables would make the generated file
 *   disagree with the database it was generated from, and the next `supabase
 *   gen types` run would silently revert it.
 *
 *   Declaring the pending shape HERE keeps the generated file honest, keeps the
 *   call sites fully typed, and puts the whole "this does not exist yet" story
 *   in one place with one obvious deletion point.
 *
 * WHEN PENDING-109 IS APPLIED: regenerate `database.ts`, delete this file, and
 * replace `pendingSchema(supabase)` with plain `supabase` at the four call
 * sites. Nothing else changes - the column names here are the column names in
 * the migration.
 *
 * Until then, every caller must assume the read can fail with "relation does
 * not exist" and handle it. `isMissingRelation` below is that check.
 */

export interface PendingSubscriptionRow {
  id: string
  user_id: string
  product_id: string
  supplier_id: string | null
  origin_order_id: string | null
  status: string
  amount_agorot: number
  platform_percent: number
  billing_interval: string
  billing_interval_count: number
  payment_token_id: string | null
  next_charge_at: string | null
  last_charge_at: string | null
  failed_attempts: number
  canceled_at: string | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
}

export interface PendingSubscriptionChargeRow {
  id: string
  subscription_id: string
  period_key: string
  status: string
  amount_agorot: number
  platform_fee_agorot: number
  supplier_due_agorot: number
  cardcom_transaction_id: string | null
  failure_code: string | null
  failure_message: string | null
  created_at: string
}

/**
 * The caller runs the query and hands back the raw result, exactly the way
 * `readOptionalColumns` in optional-columns.ts does.
 *
 * Taking a thunk rather than re-typing the Supabase client is not a style
 * choice. Handing a synthetic `Database` to `SupabaseClient<...>` makes
 * TypeScript resolve each row shape from a runtime-built select string, which
 * it cannot do: every column comes back `never`, and the errors point at the
 * call site rather than at the cause. That trap is already documented in
 * optional-columns.ts, which hit it first (TS2589). The thunk keeps the row
 * type explicit and local, where a typo is still a compile error.
 */
/**
 * Names a table the generated types do not have, for `.from()`.
 *
 * The cast is confined to this one expression instead of spreading through the
 * call sites, and it is the only place in the codebase that asserts a table
 * name the schema does not know.
 */
export function pendingTable(name: 'subscriptions' | 'subscription_charges'): never {
  return name as never
}

/**
 * Runs a query against a table that may not exist and types its rows.
 *
 * Returns `{ missing: true }` rather than throwing when the relation is absent,
 * so the caller decides what an un-migrated database should look like on its
 * particular surface - an empty account page, or a cron that reports it did
 * nothing. Any other error is returned as-is for the caller to surface.
 */
export async function selectPending<Row>(
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<
  | { ok: true; rows: Row[] }
  | { ok: false; missing: true }
  | { ok: false; missing: false; message: string }
> {
  const { data, error } = await run()

  if (error) {
    if (isMissingRelation(error)) return { ok: false, missing: true }
    return { ok: false, missing: false, message: error.message ?? 'unknown error' }
  }

  return { ok: true, rows: (data ?? []) as Row[] }
}

/**
 * Whether a PostgREST error is "this table has not been created yet" rather
 * than a real failure.
 *
 * 42P01 is Postgres's undefined_table. PGRST205 is PostgREST's own "could not
 * find the table in the schema cache", which is what actually comes back
 * through the REST API for a missing relation. Both are checked because which
 * one surfaces depends on whether the schema cache has been reloaded.
 *
 * The point of distinguishing this from a general error: a page whose feature
 * is not migrated yet should render an honest empty state, while a page whose
 * query genuinely failed must say so. Treating every error as "empty" would
 * hide a broken read behind "you have no subscriptions".
 */
export function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    (message.includes('subscriptions') || message.includes('subscription_charges')) &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
