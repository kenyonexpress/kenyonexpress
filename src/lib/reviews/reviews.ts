import { z } from 'zod'

/**
 * Verified-purchase reviews: the pure half.
 *
 * The actual verification is NOT here and cannot be: it is the INSERT policy
 * in migration 154 (`reviews_owner_insert_verified`), which admits a row only
 * when the named order_item belongs to a paid-or-later order of the inserting
 * user and sells the named product. This module only shapes input; nothing it
 * accepts or rejects grants access. (It used to fold approved ratings for the
 * product page too; 232 ended public display, so that half is gone.)
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
