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
 * The site has no reviews UI (no forms, widgets, ratings or admin screen).
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
