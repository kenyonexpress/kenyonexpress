'use server'

import { withActionContext } from '@/lib/observability/action-context'
import {
  ALREADY_REVIEWED,
  NOT_VERIFIED,
  TABLE_MISSING,
  UNDEFINED_COLUMN,
  reviewSchema,
} from '@/lib/reviews/reviews'
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
    title: typeof formData.get('title') === 'string' ? String(formData.get('title')) : undefined,
    body: typeof formData.get('body') === 'string' ? String(formData.get('body')) : undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'קלט לא תקין.' }
  }

  // ONE REVIEW PER CUSTOMER PER PRODUCT, ENFORCED HERE UNTIL 189 IS APPLIED.
  //
  // 154 constrains `order_item_id UNIQUE`, which is one review per purchased
  // LINE: the same customer buying the same product twice earns a second slot
  // on it, and 154 says so on purpose. SECTIONS 25 asks for the tighter rule,
  // and pending/189 is the index that makes the database hold it.
  //
  // This check is NOT the migration's stand-in that gets deleted afterwards.
  // A pre-check turns a race into a clean Hebrew sentence for the one customer
  // who double-submits; the index turns it into 23505 for everybody. Keeping
  // both is the same arrangement the wishlist toggle already uses, and the
  // 23505 branch below is what covers the window between the two reads.
  //
  // `reviews_owner_read` is what makes this readable: a customer sees their own
  // rows at any status, so a REJECTED review is found here and still blocks.
  // That is deliberate -- see the migration header on why the retry path is a
  // soft delete and not a resubmission.
  const { data: mine, error: mineError } = await supabase
    .from('reviews' as never)
    .select('id')
    .eq('product_id', parsed.data.productId)
    .eq('user_id', user.id)
    .limit(1)
  if (mineError && mineError.code !== TABLE_MISSING) {
    return { ok: false, error: 'שמירת הביקורת נכשלה. נסה שוב.' }
  }
  if (mine && (mine as unknown as unknown[]).length > 0) {
    return { ok: false, error: 'כבר כתבת ביקורת על המוצר הזה.' }
  }

  const title = parsed.data.title && parsed.data.title.length > 0 ? parsed.data.title : null
  const row = {
    product_id: parsed.data.productId,
    user_id: user.id,
    order_item_id: parsed.data.orderItemId,
    rating: parsed.data.rating,
    body: parsed.data.body && parsed.data.body.length > 0 ? parsed.data.body : null,
  }

  let { error } = await supabase
    .from('reviews' as never)
    .insert((title === null ? row : { ...row, title }) as never)

  // The column ships in pending/189. Naming it before that lands fails the
  // WHOLE insert with 42703, so a customer who typed a headline would lose the
  // review as well. The retry drops only the headline -- and the form does not
  // offer the field at all in that state (`titleSupported` below), so this is
  // the belt to that suspenders: a stale client, or 189 being reverted between
  // the probe and the submit.
  if (error?.code === UNDEFINED_COLUMN && title !== null) {
    ;({ error } = await supabase.from('reviews' as never).insert(row as never))
  }

  if (error) {
    if (error.code === NOT_VERIFIED) {
      return { ok: false, error: 'ביקורת אפשר לכתוב רק על מוצר שרכשת.' }
    }
    if (error.code === ALREADY_REVIEWED) {
      // Either constraint. See ALREADY_REVIEWED in lib/reviews/reviews.ts for
      // why one sentence covers both.
      return { ok: false, error: 'כבר כתבת ביקורת על המוצר הזה.' }
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
  /**
   * Whether the form may offer a headline field.
   *
   * `title` ships in pending/189 and the deployment can be behind it. A form
   * that shows the field against a database without the column would take
   * something the customer typed and drop it, and the customer would never
   * know: the review saves either way (the action retries without it). Asking
   * once, here, is what keeps the field from existing in that state.
   */
  titleSupported: boolean
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

  // ONE PER PRODUCT, not one per line. This read is by PRODUCT and not by the
  // order_item ids above, which is the whole change: the previous version
  // asked "which of my purchases has an unspent slot", so a customer who
  // bought the product twice was offered the form again after reviewing it
  // once. `reviews_owner_read` returns own rows at any status, so a rejected
  // review closes the form too -- see pending/189 on why the retry path is a
  // soft delete.
  const { data: mine, error: reviewsError } = await supabase
    .from('reviews' as never)
    .select('id, title')
    .eq('product_id', productId)
    .eq('user_id', user.id)
    .limit(1)

  // 42703: the deployment is behind 189 and has no `title` column. That says
  // nothing about whether this customer may review, so the read is repeated
  // without the column rather than answered as "not reviewable".
  if (reviewsError?.code === UNDEFINED_COLUMN) {
    const { data: retry, error: retryError } = await supabase
      .from('reviews' as never)
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .limit(1)
    if (retryError) return null
    if ((retry as unknown as unknown[]).length > 0) return null
    const first = items[0]
    return first ? { orderItemId: first.id, titleSupported: false } : null
  }

  // Any other failure -> nothing is reviewable; that is the honest answer.
  if (reviewsError) return null
  if ((mine as unknown as unknown[]).length > 0) return null

  const first = items[0]
  return first ? { orderItemId: first.id, titleSupported: true } : null
}

/**
 * The verified buyer's unspent review slot, or null. An action rather than a
 * page read so the cached product tree stays cookie-free; the INSERT policy
 * re-verifies whatever this answers.
 */
export async function getMyReviewableItem(productId: string): Promise<ReviewableItem | null> {
  return withActionContext('reviews.reviewable', () => runGetMyReviewableItem(productId))
}
