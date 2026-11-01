'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { WISHLIST_MAX_ITEMS, normalizeProductIds } from '@/lib/wishlist/guest-storage'
import { revalidatePath } from 'next/cache'

/**
 * The wishlist reads and writes the card hearts need beyond the toggle.
 *
 * Ported from the production branch (closeout L10, row 6). `toggleWishlist`
 * stays where this line already has it, in `actions/reviews.ts`; move-to-cart
 * and the share page did not come across.
 *
 * Every function acts on the caller's own rows only. `wishlists` is
 * owner-scoped by RLS, and the writes name `user_id` as well, so a policy
 * regression cannot turn one of these into a write on someone else's list.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WishlistWriteState = { ok: boolean; saved?: boolean; error?: string }

const TABLE_NOT_APPLIED = 'רשימת המועדפים עוד לא פתוחה.'
const GENERIC_FAILURE = 'הפעולה נכשלה. נסו שוב.'
const NEEDS_SESSION = 'צריך להתחבר כדי לשמור מוצרים.'

async function runGetMyWishlistProductIds(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .order('created_at', { ascending: false })
  if (error) return []
  return normalizeProductIds((data as unknown as { product_id: string }[]).map((r) => r.product_id))
}

/** The caller's saved product ids, newest first. Empty when signed out. */
export async function getMyWishlistProductIds(): Promise<string[]> {
  return withActionContext('wishlist.ids', () => runGetMyWishlistProductIds())
}

async function runRemoveFromWishlist(productId: string): Promise<WishlistWriteState> {
  if (typeof productId !== 'string' || !UUID.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NEEDS_SESSION }
  const { error } = await supabase
    .from('wishlists' as never)
    .delete()
    .eq('product_id', productId)
    .eq('user_id', user.id)
  if (error) {
    if (error.code === TABLE_MISSING) return { ok: false, error: TABLE_NOT_APPLIED }
    return { ok: false, error: GENERIC_FAILURE }
  }
  revalidatePath('/account/wishlist')
  return { ok: true, saved: false }
}

export async function removeFromWishlist(productId: string): Promise<WishlistWriteState> {
  return withActionContext('wishlist.remove', () => runRemoveFromWishlist(productId))
}

export type MergeGuestWishlistState = { ok: boolean; merged: number; ids: string[] }

async function runMergeGuestWishlist(
  guestProductIds: readonly string[],
): Promise<MergeGuestWishlistState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, merged: 0, ids: [] }

  const candidates = normalizeProductIds(guestProductIds)
  if (candidates.length === 0) {
    return { ok: true, merged: 0, ids: await runGetMyWishlistProductIds() }
  }

  const allowed = await checkRateLimit(`wishlist-merge:${user.id}`, 10, 3600)
  if (!allowed) return { ok: false, merged: 0, ids: [] }

  const { data: owned, error: readError } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .order('created_at', { ascending: false })
  if (readError) return { ok: false, merged: 0, ids: [] }

  const existing = new Set(
    (owned as unknown as { product_id: string }[]).map((r) => r.product_id.toLowerCase()),
  )
  const room = Math.max(0, WISHLIST_MAX_ITEMS - existing.size)
  const toInsert = candidates.filter((id) => !existing.has(id)).slice(0, room)
  if (toInsert.length === 0) {
    return { ok: true, merged: 0, ids: await runGetMyWishlistProductIds() }
  }

  // UPSERT, not insert, and `ignoreDuplicates` rather than a merge of columns.
  // Two tabs finishing a login at the same moment send the same list twice; the
  // second one must be a no-op, not a 23505 that loses the whole batch. There
  // is nothing to update on a row that is only a (user, product) pair.
  //
  // A product the guest saved that has since been deleted fails the FK and
  // takes the batch with it, so the whole merge is best-effort by design: the
  // caller's fallback is the ids we read back, never a thrown error.
  const { error } = await supabase
    .from('wishlists' as never)
    .upsert(
      toInsert.map((product_id) => ({ user_id: user.id, product_id })) as never,
      { onConflict: 'user_id,product_id', ignoreDuplicates: true } as never,
    )

  const ids = await runGetMyWishlistProductIds()
  if (error) return { ok: false, merged: 0, ids }
  revalidatePath('/account/wishlist')
  return { ok: true, merged: toInsert.length, ids }
}

/**
 * Folds the list a browser was carrying into the account's, once the shopper
 * signs in. Capped at the list's size, so a full account list takes nothing.
 */
export async function mergeGuestWishlist(
  guestProductIds: readonly string[],
): Promise<MergeGuestWishlistState> {
  return withActionContext('wishlist.merge_guest', () => runMergeGuestWishlist(guestProductIds))
}
