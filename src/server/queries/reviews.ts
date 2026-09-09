import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { TABLE_MISSING, UNDEFINED_COLUMN, summarizeRatings } from '@/lib/reviews/reviews'
import type { RatingSummary } from '@/lib/reviews/reviews'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Review reads. Approved rows are world-readable by policy, so the public
 * (anon) client is the right reader for the product page -- it keeps the page
 * cacheable and proves the policy instead of bypassing it.
 *
 * COOKIE-FREE ON PURPOSE: this module renders inside the catalogue's cached
 * tree, which `catalogue-render-path.test.ts` keeps free of the cookie-reading
 * client. The per-session "can I review" read lives in the reviews server
 * ACTION (the walk's deliberate boundary), fetched by the client gate after
 * paint.
 *
 * Until pending/154 is applied the table does not exist (PGRST205). Every
 * reader here degrades to "no reviews", logged once per query shape, because a
 * storefront page must not 500 over a feature that is waiting on a human to
 * apply a migration.
 */

export interface ApprovedReview {
  id: string
  rating: number
  title: string | null
  body: string | null
  created_at: string
}

export interface ProductReviews {
  reviews: ApprovedReview[]
  summary: RatingSummary | null
}

const NONE: ProductReviews = { reviews: [], summary: null }

export async function getProductReviews(productId: string, limit = 20): Promise<ProductReviews> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  // Two reads on purpose: the summary folds EVERY approved rating (a truthful
  // aggregate cannot stop at a page boundary), the list is capped for display.
  // `limit 0` is a legitimate call -- "rating only, no list" for the JSON-LD.
  const [listResult, ratingsResult] = await Promise.all([
    limit > 0
      ? // `title` ships in pending/189. Naming a column the deployment does not
        // have fails the whole select with 42703, which would empty a list of
        // real reviews to hide one optional headline, so the read is retried
        // without it. `optional-columns.ts` documents the same failure mode.
        supabase
          .from('reviews' as never)
          .select('id, rating, title, body, created_at')
          .eq('product_id', productId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(limit)
          .then((result) =>
            result.error?.code === UNDEFINED_COLUMN
              ? supabase
                  .from('reviews' as never)
                  .select('id, rating, body, created_at')
                  .eq('product_id', productId)
                  .eq('status', 'approved')
                  .order('created_at', { ascending: false })
                  .limit(limit)
              : result,
          )
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('reviews' as never)
      .select('rating')
      .eq('product_id', productId)
      .eq('status', 'approved'),
  ])

  if (ratingsResult.error) {
    if (ratingsResult.error.code !== TABLE_MISSING) {
      log.warn('reviews.read_failed', { productId, code: ratingsResult.error.code ?? null })
    }
    return NONE
  }

  const reviews = listResult.error
    ? []
    : ((listResult.data ?? []) as unknown as Partial<ApprovedReview>[]).map((row) => ({
        id: row.id ?? '',
        rating: row.rating ?? 0,
        title: row.title ?? null,
        body: row.body ?? null,
        created_at: row.created_at ?? '',
      }))
  const ratings = (ratingsResult.data ?? []) as unknown as { rating: number }[]
  return { reviews, summary: summarizeRatings(ratings.map((row) => row.rating)) }
}

/**
 * Approved-rating summaries for a batch of products, keyed by product id.
 *
 * ONE QUERY FOR A WHOLE GRID. A category page renders 24 cards; asking
 * `getProductReviews` per card is 24 cached entries and 24 round trips on a
 * miss, to paint at most 24 short strings. This reads `product_id, rating` for
 * the whole batch once and folds it here.
 *
 * A PRODUCT WITH NO APPROVED REVIEW IS ABSENT FROM THE MAP, not present with a
 * zero. `RatingStars` renders nothing for a missing summary, which is what
 * keeps an unrated product from displaying a fabricated score of zero.
 *
 * Cached and tagged like every other catalogue read, so an approval invalidates
 * the card grids at the same moment it invalidates the product page --
 * `admin/reviews.ts` calls `updateTag(CATALOGUE_TAG)` on the decision.
 */
export async function getRatingSummaries(
  productIds: readonly string[],
): Promise<Map<string, RatingSummary>> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const out = new Map<string, RatingSummary>()
  if (productIds.length === 0) return out

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('reviews' as never)
    .select('product_id, rating')
    .in('product_id', productIds as string[])
    .eq('status', 'approved')

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('reviews.summaries_failed', { code: error.code ?? null })
    }
    return out
  }

  const byProduct = new Map<string, number[]>()
  for (const row of (data ?? []) as unknown as { product_id: string; rating: number }[]) {
    const list = byProduct.get(row.product_id)
    if (list) list.push(row.rating)
    else byProduct.set(row.product_id, [row.rating])
  }
  for (const [productId, ratings] of byProduct) {
    const summary = summarizeRatings(ratings)
    if (summary) out.set(productId, summary)
  }
  return out
}

/**
 * Attaches a `rating` to anything carrying an `id`. One call at the point a
 * card list is built, rather than a prop threaded through every grid.
 *
 * Products whose id is not a uuid (the captured live-deals fixture uses
 * synthetic ids) simply come back with `rating: null`, which is the same
 * outcome as an unrated product and needs no special case at the call site.
 */
export async function attachRatings<T extends { id: string }>(
  products: readonly T[],
): Promise<(T & { rating: RatingSummary | null })[]> {
  const summaries = await getRatingSummaries(products.map((p) => p.id))
  return products.map((product) => ({ ...product, rating: summaries.get(product.id) ?? null }))
}
