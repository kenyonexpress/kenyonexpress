import { parseIls } from '@/lib/money'

/**
 * "Biggest discount first" for the category and shop archives.
 *
 * WHY THIS IS NOT AN `.order()`. PostgREST orders by a column, and there is no
 * column that holds the discount. `products.discount_percent` exists and was
 * measured against production on 2026-10-14: set on 1 of 46 active products,
 * while 16 are discounted by `full_price > kenyon_price` with the percent left
 * null. Ordering by that column would put one product first and leave the
 * other fifteen in arbitrary order. The discount a shopper sees on the card is
 * derived from the two prices, so the sort derives it the same way.
 *
 * The archive therefore reads a bounded set (`DISCOUNT_SORT_CAP`) and orders
 * it here. That is honest for a catalogue of this size and wrong for one of
 * ten thousand rows; a generated column is the fix at that point, and it is a
 * migration, which needs approval.
 *
 * Integer arithmetic on agorot. The result is basis points of the full price,
 * a ranking key only: nothing here is charged, stored or displayed.
 */

/** Upper bound on rows read for an in-memory discount sort. */
export const DISCOUNT_SORT_CAP = 500

function toAgorot(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  try {
    const amount = parseIls(value)
    return amount > 0 ? amount : null
  } catch {
    return null
  }
}

/**
 * The discount as basis points of the full price, rounded down. 0 when either
 * price is missing or the product is not actually cheaper than its full price.
 */
export function discountBp(
  fullPrice: number | string | null | undefined,
  kenyonPrice: number | string | null | undefined,
): number {
  const full = toAgorot(fullPrice)
  const price = toAgorot(kenyonPrice)
  if (full === null || price === null || price >= full) return 0
  return Math.floor(((full - price) * 10_000) / full)
}

/**
 * A new array, biggest discount first. Ties keep their incoming order, so the
 * caller's own ordering (newest first) decides between equal discounts and the
 * pages do not reshuffle between requests.
 */
export function sortByDiscountDesc<
  T extends { full_price?: number | string | null; kenyon_price?: number | string | null },
>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, bp: discountBp(row.full_price, row.kenyon_price) }))
    .sort((a, b) => b.bp - a.bp || a.index - b.index)
    .map((entry) => entry.row)
}
