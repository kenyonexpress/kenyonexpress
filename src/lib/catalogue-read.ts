import { log } from '@/lib/observability/log'

/**
 * Unwrap a PostgREST result, or fail loudly. Every CACHED catalogue read goes
 * through it.
 *
 * WHY THIS IS NOT A STYLE PREFERENCE.
 *
 * Every `use cache` reader in this codebase documents the same promise:
 * `cacheLife`'s expire window means "if Supabase is unreachable, the last good
 * catalogue keeps being served instead of an empty grid". Writing
 * `const { data } = await ...` inverts that promise. A failed query yields
 * `data: null`, `?? []` turns it into an empty list, and the enclosing
 * `use cache` scope stores that as a perfectly good answer - so the failure
 * does not fall back to the last good catalogue, it REPLACES it, for the full
 * cache life, with no line in any log.
 *
 * Measured on a built server 2026-08-20: /products served
 * "לא נמצאו מוצרים התואמים את הבחירה שלך" while /, /category/hot-deals and
 * /search all rendered products from the same table, and the identical query
 * returned 24 rows over REST. Restarting the server brought all 24 back. One
 * transient failure had been cached as an empty shop.
 *
 * `src/lib/feeds/catalogue.ts` carries an independent witness to the same
 * failure mode in its own header: a client whose key "fails silently on this
 * machine ... once collapsed the sitemap to three URLs". That was this bug,
 * patched at the client layer instead of at the error layer.
 *
 * Throwing is what restores the documented behaviour: `use cache` does not
 * store a result for a scope that threw, so the previous entry keeps being
 * served until it expires, which is the fallback every one of those headers
 * describes.
 *
 * IT LIVES HERE, AND NOT IN ONE READER, for the reason the 2026-08-20 cycles
 * found the hard way: the fix was written once, inside `category-page.ts`, and
 * five other cached readers kept the original bug because the helper was not
 * reachable from them.
 */
export function orFail<T>(
  result: { data: T; error: { code?: string; message?: string } | null },
  event: string,
  context: Record<string, unknown> = {},
): T {
  const { data, error } = result
  if (!error) return data
  // Two PostgREST codes are answers, not failures, and callers already handle
  // the empty result each comes with.
  //   PGRST116  `.single()` found no row.
  //   PGRST103  the requested range starts past the last row. That is what
  //             /products?page=9999 asks for, and the page clamps to the last
  //             page from the empty result. Throwing here regressed exactly
  //             that: caught by e2e/category.spec.ts:122 and :142, which is
  //             why the suite is worth running before calling a fix done.
  if (error.code === 'PGRST116' || error.code === 'PGRST103') return data
  log.error(event, { ...context, error })
  throw new Error(`${event}: ${error.message ?? 'catalogue read failed'}`)
}

/** Same contract as `orFail`, for the reads that also carry `count`. */
export function orFailWithCount<T>(
  result: { data: T; count: number | null; error: { code?: string; message?: string } | null },
  event: string,
  context: Record<string, unknown> = {},
): { data: T; count: number | null } {
  return { data: orFail(result, event, context), count: result.count }
}
