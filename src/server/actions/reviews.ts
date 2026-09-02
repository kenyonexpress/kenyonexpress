'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { ALREADY_REVIEWED, NOT_VERIFIED, TABLE_MISSING, reviewSchema } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'

/**
 * Review submission and wishlist toggling, both on the USER client on purpose.
 *
 * Neither action decides anything. The purchase-verification for a review is
 * the INSERT policy from migration 154, and the wishlist is owner-scoped by
 * its RLS; running on the user's own session means those policies are the
 * enforcement, and this file only translates their refusals into Hebrew. An
 * admin-client version of these writes would silently re-open everything the
 * policies close.
 */

export type ReviewActionState = { ok: boolean; error?: string }

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

export type WishlistActionState = { ok: boolean; saved?: boolean; error?: string }

async function runToggleWishlist(productId: string): Promise<WishlistActionState> {
  if (typeof productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לשמור מוצרים.' }

  const allowed = await checkRateLimit(`wishlist-toggle:${user.id}`, 60, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי פעולות. נסה שוב בעוד רגע.' }

  const { data: existing, error: readError } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .eq('product_id', productId)
    .maybeSingle()
  if (readError) {
    if (readError.code === TABLE_MISSING) {
      return { ok: false, error: 'רשימת המשאלות עוד לא פתוחה.' }
    }
    return { ok: false, error: 'הפעולה נכשלה. נסה שוב.' }
  }

  if (existing) {
    const { error } = await supabase
      .from('wishlists' as never)
      .delete()
      .eq('product_id', productId)
      .eq('user_id', user.id)
    if (error) return { ok: false, error: 'הפעולה נכשלה. נסה שוב.' }
    revalidatePath('/account/wishlist')
    return { ok: true, saved: false }
  }

  const { error } = await supabase
    .from('wishlists' as never)
    .insert({ user_id: user.id, product_id: productId } as never)
  // A concurrent double-click races the read; the PK makes the second insert a
  // 23505, which lands in the same place as "already saved".
  if (error && error.code !== ALREADY_REVIEWED) {
    return { ok: false, error: 'הפעולה נכשלה. נסה שוב.' }
  }
  revalidatePath('/account/wishlist')
  return { ok: true, saved: true }
}

export async function toggleWishlist(productId: string): Promise<WishlistActionState> {
  return withActionContext('wishlist.toggle', () => runToggleWishlist(productId))
}

async function runGetWishlistSaved(productId: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .eq('product_id', productId)
    .maybeSingle()
  return !error && data != null
}

/** Read-only, own rows only (RLS): lets the button paint its saved state. */
export async function getWishlistSaved(productId: string): Promise<boolean> {
  return withActionContext('wishlist.saved', () => runGetWishlistSaved(productId))
}

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
