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
  console.warn(`[optional-columns] ${message}`)
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
