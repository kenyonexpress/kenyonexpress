'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { ALREADY_REVIEWED, TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'

/**
 * Wishlist toggling, on the USER client on purpose.
 *
 * The action decides nothing: the wishlist is owner-scoped by its RLS, so
 * running on the user's own session means the policy is the enforcement and
 * this file only translates its refusals into Hebrew. An admin-client version
 * of these writes would silently re-open everything the policy closes.
 *
 * The customer review form that lived here (`submitReview`,
 * `getMyReviewableItem`) was removed in F42 together with the storefront
 * review components: the site shows no review buttons or forms. Approved
 * reviews are still readable by the admin screen through `server/queries`.
 */

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

  if (error) {
    if (error.code !== ALREADY_REVIEWED) {
      return { ok: false, error: 'הפעולה נכשלה. נסה שוב.' }
    }
    // 23505 says the (user_id, product_id) pair is taken. It is taken by two
    // different situations and the error code cannot tell them apart, so the
    // re-read does. Measured against production 2026-09-09, both in
    // transactions that were rolled back, as the owner with the real
    // auth.uid():
    //
    //   concurrent double-click, live row       insert 23505, re-read 1 row
    //   row soft-deleted (185's SELECT hides it) insert 23505, re-read 0 rows
    //
    // Only the first is "already saved". Answering the second the same way
    // fills the heart while /account/wishlist stays empty -- a success the
    // customer can see is false. See wishlist-soft-delete-restore.test.ts.
    const { data: reread, error: rereadError } = await supabase
      .from('wishlists' as never)
      .select('product_id')
      .eq('product_id', productId)
      .maybeSingle()
    // A re-read that failed proves nothing either, and this branch exists to
    // stop reporting an unproven save, so it refuses on both.
    if (rereadError != null || reread == null) {
      return { ok: false, error: 'הפעולה נכשלה. נסה שוב.' }
    }
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
