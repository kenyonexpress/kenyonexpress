/**
 * The two functions 227 adds, named in one place because the generated types do
 * not know them yet.
 *
 * `src/types/database.ts` is generated from production and
 * `migrations/pending/227_voucher_expiry_engine.sql` is not applied, so
 * `supabase.rpc('extend_voucher_expiry')` neither type-checks nor works at
 * runtime. Same situation, same shape and the same single deletion point as
 * `pending-reports.ts` and `pending-schema.ts`: the cast is confined to one
 * expression rather than sprayed across call sites, where the next `supabase
 * gen types` run would have to find every one of them.
 *
 * WHEN 227 IS APPLIED: regenerate `database.ts`, delete this file, and replace
 * `pendingExpiryRpc('x')` with `'x'` at its call sites. Nothing else changes.
 *
 * Until then every caller must treat "the function is not there" as its own
 * outcome and NOT as a failure. The two surfaces answer it differently and both
 * answers are deliberate:
 *
 *   the metrics table   says the migration is not applied, and prints no zeros.
 *                       A table of 0.0% would be read as "nothing expires here".
 *   the extend form     refuses and names the migration. An override that
 *                       silently did nothing is worse than one that is missing:
 *                       support would tell the customer their coupon was
 *                       extended.
 */

export type PendingExpiryRpcName = 'extend_voucher_expiry' | 'supplier_expiry_metrics'

/** Names an RPC the generated types do not have, for `.rpc()`. */
export function pendingExpiryRpc(name: PendingExpiryRpcName): never {
  return name as never
}

export type PendingExpiryResult<Row> =
  | { ok: true; rows: Row[] }
  | { ok: false; missing: true }
  | { ok: false; missing: false; message: string }

/**
 * Runs an RPC that may not exist yet and types its rows.
 *
 * A scalar return (`extend_voucher_expiry` returns one jsonb) arrives as a bare
 * value rather than an array, so it is wrapped. `null` is an empty list and not
 * `[null]`, which would put a row that is not a row in front of a caller that
 * checked `length`.
 */
export async function callPendingExpiryRpc<Row>(
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<PendingExpiryResult<Row>> {
  const { data, error } = await run()

  if (error) {
    if (isMissingExpiryFunction(error)) return { ok: false, missing: true }
    return { ok: false, missing: false, message: error.message ?? 'unknown error' }
  }

  const rows = Array.isArray(data) ? (data as Row[]) : data == null ? [] : [data as Row]
  return { ok: true, rows }
}

/**
 * Whether an error is "227 is not applied" rather than a real failure.
 *
 * 42883 is Postgres's undefined_function; PGRST202 is PostgREST's "could not
 * find the function in the schema cache". Which one surfaces depends on whether
 * the schema cache has been reloaded, so both are checked -- the same pair
 * `pending-reports.ts` checks, and the same pair the abandoned-cart route had to
 * learn about after it returned 500 on every run for a signature production did
 * not have.
 *
 * The name match is deliberately narrow. A message mentioning some other
 * missing function is somebody else's bug and must not be reported here as an
 * unapplied migration.
 */
export function isMissingExpiryFunction(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    (message.includes('extend_voucher_expiry') || message.includes('supplier_expiry_metrics')) &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
