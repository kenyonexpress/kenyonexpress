import { log } from '@/lib/observability/log'
/**
 * Reads columns that may not exist yet in the target database.
 *
 * The deployment this code talks to is behind the migration chain. Migration
 * 054 adds `products.coupon_price_ils` and `products.offer_valid_until`, and it
 * has not been applied to the hosted project: a `select` naming either column
 * fails outright with Postgres 42703, which takes down the WHOLE query, not
 * just that field. Every surface on the purchase path names one of them — the
 * cart line builder, the checkout snapshot, voucher issuance, and the product
 * page — so the shop cannot take an order at all.
 *
 * The fix is to apply 054. Until that happens, the storefront should degrade
 * rather than 500: a coupon with no readable price is already modelled as
 * unsellable by `buildCouponOffer`, which is the correct customer-facing
 * outcome. This helper makes the query reach that state instead of throwing.
 *
 * It is deliberately narrow. It is NOT a general "ignore schema errors" tool:
 * it swallows exactly the undefined-column code, logs once per process so the
 * gap stays visible in the server logs, and returns an empty map so callers
 * see `undefined` for the field — the same thing they would see for a NULL.
 */

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

const warned = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  log.warn('db.optional_column_missing', { detail: message })
}

/**
 * The caller runs the query itself and hands back the raw result.
 *
 * Taking a thunk rather than the Supabase query builder is deliberate: typing
 * against the builder's generics makes TypeScript resolve the row shape from a
 * runtime-built select string, which it cannot do and which blows the
 * instantiation depth limit (TS2589).
 */
export type OptionalColumnsResult<Row> = PromiseLike<{
  data: Row[] | null
  error: { code?: string; message: string } | null
}>

/**
 * Fetches `columns` for `ids`, keyed by id.
 *
 * Returns an empty map when the columns do not exist in this database, so the
 * caller reads `undefined` and takes its own missing-value path.
 */
export async function readOptionalColumns<Row extends { id: string }>(
  run: (select: string, ids: string[]) => OptionalColumnsResult<Row>,
  columns: readonly string[],
  ids: readonly string[],
  label: string,
): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map()

  const { data, error } = await run(['id', ...columns].join(', '), [...ids])

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      warnOnce(
        label,
        `${label}: ${columns.join(', ')} missing from this database — apply supabase/migrations/054_voucher_redemption.sql. Coupons will read as unpriced until then.`,
      )
      return new Map()
    }
    throw new Error(`${label}: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.id, row]))
}

/**
 * A column that exists under one name before a migration and another after it,
 * with the conversion needed to read either as the same unit.
 */
export type ColumnCandidate<T> = {
  column: string
  toCanonical: (stored: unknown) => T | null
}

const winningColumn = new Map<string, string>()

/**
 * Reads one value per id from whichever of `candidates` this database has.
 *
 * The winner is remembered per process under `key`, so the steady state is one
 * query rather than one per candidate. A miss is not cached: if every candidate
 * 42703s, the next call probes again rather than pinning the process to an
 * answer derived from a database that may have been mid-migration.
 *
 * Returns an empty map when none of them exist, so the caller reads `null` and
 * takes its own missing-value path instead of losing the whole query.
 */
export async function readFirstAvailableColumn<T>(
  run: (select: string, ids: string[]) => OptionalColumnsResult<Record<string, unknown>>,
  candidates: readonly ColumnCandidate<T>[],
  ids: readonly string[],
  key: string,
): Promise<Map<string, T | null>> {
  if (ids.length === 0) return new Map()

  const remembered = winningColumn.get(key)
  const ordered = remembered
    ? [...candidates].sort((a, b) =>
        a.column === remembered ? -1 : b.column === remembered ? 1 : 0,
      )
    : candidates

  for (const candidate of ordered) {
    const { data, error } = await run(`id, ${candidate.column}`, [...ids])
    if (error) {
      if (error.code === UNDEFINED_COLUMN) continue
      throw new Error(`${key}: ${error.message}`)
    }
    winningColumn.set(key, candidate.column)
    return new Map(
      (data ?? []).map((row) => [String(row.id), candidate.toCanonical(row[candidate.column])]),
    )
  }

  warnOnce(
    key,
    `${key}: none of ${candidates.map((c) => c.column).join(', ')} exist in this database; reading the value as absent.`,
  )
  return new Map()
}

/** Test seam. Never called by application code. */
export function __resetColumnCandidateCache(): void {
  winningColumn.clear()
}

/**
 * Cashback rate on a product, as a percent, from whichever column exists.
 *
 * 059 renames `cashback_percent` to `cashback_bp` and moves it to basis points.
 * It is not applied to the hosted project, which carries `cashback_percent`.
 * Naming the wrong one fails the WHOLE cart select with 42703, `products` comes
 * back null, and every line loses its name, image and price while the header
 * still shows a correct item count, because the count comes from the `carts`
 * row. That exact failure is recorded in STATE for 2026-07-28 and was then
 * "fixed" to the other name, which reproduces it in the other direction.
 */
export const CASHBACK_PERCENT_CANDIDATES: readonly ColumnCandidate<number>[] = [
  { column: 'cashback_bp', toCanonical: (v) => (v == null ? null : Number(v) / 100) },
  { column: 'cashback_percent', toCanonical: (v) => (v == null ? null : Number(v)) },
]

/**
 * A wallet entry's amount, in agorot, from whichever column exists.
 *
 * `wallet_entries.amount_ils` is what the hosted project has; 059 renames it to
 * `amount_agorot`. The confirmation page reads it to show the cashback a
 * purchase earned, and naming the wrong one failed that read outright.
 *
 * Keyed by idempotency_key rather than id at the only call site, which is why
 * the row identity is read from that column here.
 */
export const WALLET_AMOUNT_CANDIDATES: readonly ColumnCandidate<number>[] = [
  { column: 'amount_agorot', toCanonical: (v) => (v == null ? null : Math.round(Number(v))) },
  { column: 'amount_ils', toCanonical: (v) => (v == null ? null : Math.round(Number(v) * 100)) },
]

/**
 * A wallet account's balance, in agorot, from whichever column exists.
 *
 * Same rename as the entry amount: the hosted project carries
 * `wallet_accounts.balance_ils` and 059 replaces it with integer
 * `balance_agorot`. `fn_wallet_transfer` in production reads and writes
 * `balance_ils`, so that is the live truth there.
 */
export const WALLET_BALANCE_CANDIDATES: readonly ColumnCandidate<number>[] = [
  { column: 'balance_agorot', toCanonical: (v) => (v == null ? null : Math.round(Number(v))) },
  { column: 'balance_ils', toCanonical: (v) => (v == null ? null : Math.round(Number(v) * 100)) },
]

/**
 * The customer's wallet account, by user, in agorot.
 *
 * Every reader of the balance goes through here, because the codebase had
 * settled into naming the column by guess and had guessed differently in four
 * places: the account area and the checkout page named `balance_agorot`, which
 * does not exist in production, so both 42703'd and reported a balance of zero
 * to every customer, while the action that actually debits the wallet and the
 * admin user page named `balance_ils` and worked. Verified against the live
 * database on 2026-07-31: `select id, balance_agorot from wallet_accounts`
 * answers `42703: column "balance_agorot" does not exist`.
 *
 * The consequence was one-directional and worth stating: the debit authority
 * was the one reading the right name, so nobody was overcharged and no credit
 * was lost. The money was simply invisible and therefore unspendable.
 *
 * Agorot is the return unit whichever column won, so a caller can never be
 * handed shekels it believes are agorot. The account id is returned alongside
 * because the two callers that need it would otherwise select the row twice.
 */
export async function readWalletAccountAgorot(
  run: (select: string, ids: string[]) => OptionalColumnsResult<Record<string, unknown>>,
  userId: string,
): Promise<{ accountId: string | null; balanceAgorot: number }> {
  const rows = await readFirstAvailableColumn<number>(
    run,
    WALLET_BALANCE_CANDIDATES,
    [userId],
    'wallet_accounts.balance',
  )
  const [accountId, balanceAgorot] = [...rows][0] ?? []
  return { accountId: accountId ?? null, balanceAgorot: balanceAgorot ?? 0 }
}

/** The two columns migration 054 adds to `products`. */
export const COUPON_054_COLUMNS = ['coupon_price_ils', 'offer_valid_until'] as const

export type Coupon054Row = {
  id: string
  coupon_price_ils: number | null
  offer_valid_until: string | null
}

/**
 * Where the sticker price lives, by deployment, most current first.
 *
 * Migration 059 renames `products.price_ils` to `price_ils_legacy` and adds
 * integer `price_agorot`. It is not applied to the hosted project, which still
 * carries `price_ils` and has neither of the other two.
 *
 * Naming the wrong one in the product page's main select is not a cosmetic
 * miss: 42703 fails the whole query, `data` comes back null, and the page calls
 * notFound(). Every product page 404s. That happened twice on 2026-07-28, once
 * in each direction, each time as the fix for the other. Probing instead of
 * guessing is what stops the third time.
 */
export const STICKER_PRICE_CANDIDATES = [
  { column: 'price_ils', toIls: (v: number) => v },
  { column: 'price_agorot', toIls: (v: number) => v / 100 },
] as const

/**
 * The sticker price in shekels, from whichever column this database has.
 *
 * Returns null when none of the candidates exist or the row has no value, which
 * is the caller's cue to fall back to its own pre-059 column rather than to
 * invent a price.
 */
export async function readStickerPriceIls(
  run: (select: string, ids: string[]) => OptionalColumnsResult<Record<string, unknown>>,
  productId: string,
  label: string,
): Promise<number | null> {
  for (const candidate of STICKER_PRICE_CANDIDATES) {
    const rows = await readOptionalColumns<{ id: string } & Record<string, unknown>>(
      run as never,
      [candidate.column],
      [productId],
      `${label} (${candidate.column})`,
    )
    const raw = rows.get(productId)?.[candidate.column]
    if (raw === null || raw === undefined) continue
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) continue
    return candidate.toIls(parsed)
  }
  return null
}
