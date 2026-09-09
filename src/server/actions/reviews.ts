'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { ALREADY_REVIEWED, NOT_VERIFIED, TABLE_MISSING, reviewSchema } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'

/**
 * Review submission, on the USER client on purpose.
 *
 * The action decides nothing. The purchase-verification is the INSERT policy
 * from migration 154; running on the user's own session means that policy is
 * the enforcement, and this file only translates its refusals into Hebrew. An
 * admin-client version of this write would silently re-open everything the
 * policy closes.
 */

export type ReviewActionState = { ok: boolean; error?: string }

/**
 * NO `updateTag(CATALOGUE_TAG)` HERE, AND THAT IS DELIBERATE.
 *
 * `src/lib/catalogue-cache.ts` requires every write that changes what a shopper
 * sees to invalidate the catalogue tag, and `server/queries/reviews.ts` reads
 * this table inside `use cache`. This write is the exception, because it
 * changes nothing a shopper sees:
 *
 * The insert sets no `status`, so it takes the column default, and migration
 * 154 declares `status text NOT NULL DEFAULT 'pending'`. The cached read
 * filters `status = 'approved'`. A freshly submitted review is therefore
 * invisible to everybody until an admin approves it, and `admin/reviews.ts` is
 * what calls `updateTag` at that moment.
 *
 * Invalidating here would flush the entire catalogue cache on every submission
 * in order to publish nothing.
 *
 * `scripts/cache-invalidation-gate.mjs` carries the same argument in
 * DELIBERATE_EXCEPTIONS; if the default ever stops being 'pending', both have
 * to change and the gate is what will say so.
 */
async function runSubmitReview(formData: FormData): Promise<ReviewActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לכתוב ביקורת.' }

  const allowed = await checkRateLimit(`review-submit:${user.id}`, 5, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי ביקורות בשעה האחרונה. נסה שוב מאוחר יותר.' }

  const parsed = reviewSchema.safeParse({
    productId: formData.get('productId'),
    orderItemId: formData.get('orderItemId'),
    rating: Number(formData.get('rating')),
    body: typeof formData.get('body') === 'string' ? String(formData.get('body')) : undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'קלט לא תקין.' }
  }

  const { error } = await supabase.from('reviews' as never).insert({
    product_id: parsed.data.productId,
    user_id: user.id,
    order_item_id: parsed.data.orderItemId,
    rating: parsed.data.rating,
    body: parsed.data.body && parsed.data.body.length > 0 ? parsed.data.body : null,
  } as never)

  if (error) {
    if (error.code === NOT_VERIFIED) {
      return { ok: false, error: 'ביקורת אפשר לכתוב רק על מוצר שרכשת.' }
    }
    if (error.code === ALREADY_REVIEWED) {
      return { ok: false, error: 'כבר כתבת ביקורת על הרכישה הזו.' }
    }
    if (error.code === TABLE_MISSING) {
      return { ok: false, error: 'הביקורות עוד לא פתוחות. נסה שוב בקרוב.' }
    }
    return { ok: false, error: 'שמירת הביקורת נכשלה. נסה שוב.' }
  }

  return { ok: true }
}

export async function submitReview(formData: FormData): Promise<ReviewActionState> {
  return withActionContext('reviews.submit', () => runSubmitReview(formData))
}

/**
 * THE WISHLIST ACTIONS MOVED. `src/server/actions/wishlist.ts` holds
 * toggleWishlist and its neighbours as of 2026-09-09. They lived here because
 * they shared migration 154 and one paragraph of rationale with reviews, which
 * is a fact about a .sql file and not about either feature; every wishlist
 * import pulled the review zod schema and the rating maths along with it.
 */

export interface ReviewableItem {
  orderItemId: string
}

async function runGetMyReviewableItem(productId: string): Promise<ReviewableItem | null> {
  if (typeof productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(productId)) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: items, error } = await supabase
    .from('order_items')
    .select('id, order_id, orders!inner(user_id, status)')
    .eq('product_id', productId)
    .eq('orders.user_id', user.id)
    .in('orders.status', ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled'])
    .limit(10)
  if (error || !items || items.length === 0) return null

  const { data: mine, error: reviewsError } = await supabase
    .from('reviews' as never)
    .select('order_item_id')
    .in(
      'order_item_id',
      items.map((item) => item.id),
    )
  // Table missing -> nothing is reviewable yet; that is the honest answer.
  if (reviewsError) return null

  const taken = new Set(
    (mine as unknown as { order_item_id: string }[]).map((row) => row.order_item_id),
  )
  const free = items.find((item) => !taken.has(item.id))
  return free ? { orderItemId: free.id } : null
}

/**
 * The verified buyer's unspent review slot, or null. An action rather than a
 * page read so the cached product tree stays cookie-free; the INSERT policy
 * re-verifies whatever this answers.
 */
export async function getMyReviewableItem(productId: string): Promise<ReviewableItem | null> {
  return withActionContext('reviews.reviewable', () => runGetMyReviewableItem(productId))
}
