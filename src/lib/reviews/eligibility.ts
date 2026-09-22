/**
 * Who may submit a review, and why the database would refuse them.
 *
 * THE INSERT POLICY IS THE REAL GATE (154): the named order_item must belong
 * to a paid-or-later order of the inserting user and sell the named product.
 * This module restates that decision in Hebrew before the round trip, and adds
 * the fraud rule 189 will enforce once applied: one live review per customer
 * per product, not one per purchased line.
 *
 * Pure: no database, no clock. The action loads the facts; this decides.
 */

export const REVIEWABLE_ORDER_STATUSES = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
] as const

export type ReviewableOrderStatus = (typeof REVIEWABLE_ORDER_STATUSES)[number]

/** Product-side copy limit. The column CHECK is 2000; tightening UX never needs a migration. */
export const REVIEW_BODY_MAX = 1000

export type ExistingReview = {
  orderItemId: string
  productId: string
  deletedAt: string | null
}

export type ReviewDraft = {
  userId: string | null
  orderUserId: string
  orderStatus: string
  productId: string
  lineProductId: string | null
  orderItemId: string
  rating: number
  body: string | null
  existing: readonly ExistingReview[]
}

export type ReviewRefusal =
  | 'not_signed_in'
  | 'not_owner'
  | 'not_paid'
  | 'wrong_product'
  | 'bad_rating'
  | 'body_too_long'
  | 'duplicate_line'
  | 'duplicate_product'

export const REVIEW_REFUSAL_HE: Record<ReviewRefusal, string> = {
  not_signed_in: 'צריך להתחבר כדי לכתוב ביקורת.',
  not_owner: 'אפשר לכתוב ביקורת רק על הזמנה שלכם.',
  not_paid: 'אפשר לכתוב ביקורת רק אחרי שההזמנה שולמה.',
  wrong_product: 'הפריט הזה אינו המוצר שנרכש.',
  bad_rating: 'הדירוג חייב להיות בין 1 ל-5.',
  body_too_long: 'הטקסט ארוך מדי.',
  duplicate_line: 'כבר נכתבה ביקורת על הפריט הזה.',
  duplicate_product: 'כבר נכתבה ביקורת על המוצר הזה.',
}

function isReviewableStatus(status: string): status is ReviewableOrderStatus {
  return (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(status)
}

function live(existing: readonly ExistingReview[]): ExistingReview[] {
  return existing.filter((row) => row.deletedAt == null)
}

export function refuseReview(draft: ReviewDraft): ReviewRefusal | null {
  if (!draft.userId) return 'not_signed_in'
  if (draft.userId !== draft.orderUserId) return 'not_owner'
  if (!isReviewableStatus(draft.orderStatus)) return 'not_paid'
  if (!draft.lineProductId || draft.lineProductId !== draft.productId) return 'wrong_product'
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) return 'bad_rating'
  if (draft.body != null && draft.body.length > REVIEW_BODY_MAX) return 'body_too_long'

  const rows = live(draft.existing)
  if (rows.some((row) => row.orderItemId === draft.orderItemId)) return 'duplicate_line'
  if (rows.some((row) => row.productId === draft.productId)) return 'duplicate_product'
  return null
}

/**
 * Average and count over approved ratings. Null when there are none, so a
 * product with zero reviews shows no stars rather than a fabricated 0.0.
 *
 * Integer tenths: 23/5 is 4.6, never 4.6000000001.
 */
export function aggregateRatings(ratings: readonly number[]): {
  count: number
  averageTenths: number
} | null {
  const valid = ratings.filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, n) => acc + n, 0)
  return { count: valid.length, averageTenths: Math.floor((sum * 10) / valid.length) }
}

export function formatAverageHe(averageTenths: number): string {
  return `${Math.floor(averageTenths / 10)}.${averageTenths % 10}`
}
