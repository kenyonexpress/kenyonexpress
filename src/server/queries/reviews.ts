import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { TABLE_MISSING, summarizeRatings } from '@/lib/reviews/reviews'
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
      ? supabase
          .from('reviews' as never)
          .select('id, rating, body, created_at')
          .eq('product_id', productId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(limit)
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

  const reviews = listResult.error ? [] : ((listResult.data ?? []) as unknown as ApprovedReview[])
  const ratings = (ratingsResult.data ?? []) as unknown as { rating: number }[]
  return { reviews, summary: summarizeRatings(ratings.map((row) => row.rating)) }
}
