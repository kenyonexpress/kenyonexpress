import { z } from 'zod'

/**
 * Verified-purchase reviews: the pure half.
 *
 * The actual verification is NOT here and cannot be: it is the INSERT policy
 * in migration 154 (`reviews_owner_insert_verified`), which admits a row only
 * when the named order_item belongs to a paid-or-later order of the inserting
 * user and sells the named product. This module only shapes input and folds
 * approved ratings for display; nothing it accepts or rejects grants access.
 */

/** PostgREST: relation does not exist. The table ships in pending/154. */
export const TABLE_MISSING = 'PGRST205'

/** RLS refusal -- the policy said this purchase does not back this review. */
export const NOT_VERIFIED = '42501'

/** UNIQUE(order_item_id) -- this purchase already has its review. */
export const ALREADY_REVIEWED = '23505'

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1, 'דירוג בין 1 ל-5').max(5, 'דירוג בין 1 ל-5'),
  // 1000 is the product limit; the DB CHECK holds a harder 2000 so copy
  // changes here never need a migration.
  body: z.string().trim().max(1000, 'עד 1000 תווים').optional(),
})

export type ReviewInput = z.infer<typeof reviewSchema>

export interface RatingSummary {
  count: number
  /** Average to one decimal, e.g. 4.3. Integer math until the last division. */
  average: number
}

/** Folds approved ratings. Empty input is `null` -- "no rating" is not 0. */
export function summarizeRatings(ratings: readonly number[]): RatingSummary | null {
  if (ratings.length === 0) return null
  let sum = 0
  for (const rating of ratings) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error(`summarizeRatings: illegal rating ${rating}`)
    }
    sum += rating
  }
  return { count: ratings.length, average: Math.round((sum * 10) / ratings.length) / 10 }
}
