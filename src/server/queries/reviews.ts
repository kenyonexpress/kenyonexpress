import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { NOT_VERIFIED, TABLE_MISSING, summarizeRatings } from '@/lib/reviews/reviews'
import type { RatingSummary } from '@/lib/reviews/reviews'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * THERE IS NO PUBLIC REVIEW READ, AND THAT IS A DECISION, NOT A GAP.
 *
 * This module used to read approved reviews through the anon client for the
 * product page's visible list and its JSON-LD aggregateRating. Migration 232
 * (2026-09-10) dropped `reviews_public_read_approved` and revoked anon SELECT
 * on `reviews`: per the business model review content is never displayed to
 * visitors, it only feeds admin moderation. The reads that remain live where
 * their session does:
 *
 *   - the buyer's own rows: `getMyReviewableItem` in
 *     src/server/actions/reviews.ts, on the user client, scoped by
 *     `reviews_owner_read`;
 *   - moderation: src/app/(admin)/admin/reviews/page.tsx, on the service
 *     role.
 *
 * A rebuilt public read would start by reversing 232, so this file stays as
 * the marker of why it is one migration, one policy, and one module all
 * saying the same thing. The file itself remains because deleting files is a
 * stop-and-ask action in this project and the tombstone is the answer to
 * "where did getProductReviews go".
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
    // TABLE_MISSING: migration 154 not applied yet
    // NOT_VERIFIED: anon role has no SELECT grant on reviews table
    if (ratingsResult.error.code !== TABLE_MISSING && ratingsResult.error.code !== NOT_VERIFIED) {
      log.warn('reviews.read_failed', { productId, code: ratingsResult.error.code ?? null })
    }
    return NONE
  }

  const reviews = listResult.error ? [] : ((listResult.data ?? []) as unknown as ApprovedReview[])
  const ratings = (ratingsResult.data ?? []) as unknown as { rating: number }[]
  return { reviews, summary: summarizeRatings(ratings.map((row) => row.rating)) }
}
