'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { WISHLIST_MAX_ITEMS, normalizeProductIds } from '@/lib/wishlist/guest-storage'
import { addToCart } from '@/server/actions/cart'
import { revalidatePath } from 'next/cache'

/**
 * The wishlist writes, on the USER's own Supabase client, never the admin one.
 *
 * `wishlists` is owner-scoped by RLS in all four directions (154, re-cut into
 * four per-command policies by 185). Running on the user session means those
 * policies ARE the enforcement and this file only turns their refusals into
 * Hebrew. An admin-client version of these writes would bypass every one of
 * them, and the bypass would be invisible: the happy path looks identical.
 *
 * SPLIT OUT OF `reviews.ts` on 2026-09-09. The two features shared a file
 * because they shared migration 154 and one sentence of rationale, not because
 * anything about a wishlist is a review. Keeping them together meant every
 * wishlist import pulled the review zod schema and its rating maths in with it.
 *
 * 23505 IS TWO DIFFERENT ANSWERS AND THE CODE CANNOT TELL THEM APART, which is
 * why the insert path re-reads. See `runToggleWishlist` and
 * `src/__tests__/wishlist-soft-delete-restore.test.ts`.
 */

/** 23505. Named for what it means here rather than for the review that shares it. */
const UNIQUE_VIOLATION = '23505'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WishlistActionState = { ok: boolean; saved?: boolean; error?: string }

const TABLE_NOT_APPLIED = 'רשימת המועדפים עוד לא פתוחה.'
const GENERIC_FAILURE = 'הפעולה נכשלה. נסו שוב.'
const NEEDS_SESSION = 'צריך להתחבר כדי לשמור מוצרים.'

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function runToggleWishlist(productId: string): Promise<WishlistActionState> {
  if (typeof productId !== 'string' || !UUID.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NEEDS_SESSION }

  const allowed = await checkRateLimit(`wishlist-toggle:${user.id}`, 60, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי פעולות. נסו שוב בעוד רגע.' }

  const { data: existing, error: readError } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .eq('product_id', productId)
    .maybeSingle()
  if (readError) {
    if (readError.code === TABLE_MISSING) return { ok: false, error: TABLE_NOT_APPLIED }
    return { ok: false, error: GENERIC_FAILURE }
  }

  if (existing) {
    const { error } = await supabase
      .from('wishlists' as never)
      .delete()
      .eq('product_id', productId)
      .eq('user_id', user.id)
    if (error) return { ok: false, error: GENERIC_FAILURE }
    revalidatePath('/account/wishlist')
    return { ok: true, saved: false }
  }

  // THE CAP, and it is checked before the insert rather than enforced by the
  // database, because there is no constraint that can express "at most 100 rows
  // per user" without a trigger. A count is one cheap indexed read on a table
  // whose rows are owner-scoped, and refusing here is what
  // `docs/ARCHITECTURE-WISHLIST.md` non-negotiable 5 asks for: a curated list
  // does not silently evict the customer's oldest save to make room.
  const { count, error: countError } = await supabase
    .from('wishlists' as never)
    .select('product_id', { count: 'exact', head: true })
  if (countError) return { ok: false, error: GENERIC_FAILURE }
  if ((count ?? 0) >= WISHLIST_MAX_ITEMS) {
    return { ok: false, error: `רשימת המועדפים מלאה (${WISHLIST_MAX_ITEMS} מוצרים).` }
  }

  const { error } = await supabase
    .from('wishlists' as never)
    .insert({ user_id: user.id, product_id: productId } as never)

  if (error) {
    if (error.code !== UNIQUE_VIOLATION) return { ok: false, error: GENERIC_FAILURE }
    // 23505 says the (user_id, product_id) pair is taken. It is taken by two
    // different situations and the error code cannot tell them apart, so the
    // re-read does. Measured against production 2026-09-09, both in
    // transactions that were rolled back, as the owner with the real
    // auth.uid():
    //
    //   concurrent double-click, live row        insert 23505, re-read 1 row
    //   row soft-deleted (185's SELECT hides it) insert 23505, re-read 0 rows
    //
    // Only the first is "already saved". Answering the second the same way
    // fills the heart while the wishlist page stays empty -- a success the
    // customer can see is false.
    const { data: reread, error: rereadError } = await supabase
      .from('wishlists' as never)
      .select('product_id')
      .eq('product_id', productId)
      .maybeSingle()
    // A re-read that itself failed proves nothing either, and this branch
    // exists to stop reporting an unproven save, so it refuses on both.
    if (rereadError != null || reread == null) return { ok: false, error: GENERIC_FAILURE }
  }
  revalidatePath('/account/wishlist')
  return { ok: true, saved: true }
}

export async function toggleWishlist(productId: string): Promise<WishlistActionState> {
  return withActionContext('wishlist.toggle', () => runToggleWishlist(productId))
}

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

/**
 * The whole saved set in one round trip, which is what the provider bootstraps
 * from.
 *
 * The alternative -- the old `getWishlistSaved(productId)`, one call per heart
 * -- costs one server action per card. A category page renders 24 cards, so a
 * signed-in shopper paid 24 POSTs to paint 24 hearts, each one re-reading the
 * session cookie and hitting the same table. The set is at most 100 uuids.
 */
export async function getMyWishlistProductIds(): Promise<string[]> {
  return withActionContext('wishlist.ids', () => runGetMyWishlistProductIds())
}

async function runRemoveFromWishlist(productId: string): Promise<WishlistActionState> {
  if (typeof productId !== 'string' || !UUID.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: NEEDS_SESSION }
  const supabase = await createClient()
  const { error } = await supabase
    .from('wishlists' as never)
    .delete()
    .eq('product_id', productId)
    .eq('user_id', userId)
  if (error) {
    if (error.code === TABLE_MISSING) return { ok: false, error: TABLE_NOT_APPLIED }
    return { ok: false, error: GENERIC_FAILURE }
  }
  revalidatePath('/account/wishlist')
  return { ok: true, saved: false }
}

/**
 * Remove, not toggle. The wishlist page needs an idempotent removal: the row is
 * already on screen, so a toggle that races a second tab would ADD the product
 * back and the button would read as broken.
 */
export async function removeFromWishlist(productId: string): Promise<WishlistActionState> {
  return withActionContext('wishlist.remove', () => runRemoveFromWishlist(productId))
}

export type MoveToCartState = { ok: boolean; error?: string }

async function runMoveWishlistItemToCart(productId: string): Promise<MoveToCartState> {
  if (typeof productId !== 'string' || !UUID.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: NEEDS_SESSION }

  // ADD FIRST, REMOVE SECOND, AND THE ORDER IS THE WHOLE DESIGN.
  //
  // `addToCart` is the only place that resolves price, stock, variant and the
  // platform percent snapshot, and it refuses a product that is out of stock or
  // no longer sellable. Removing from the wishlist first would mean a refused
  // add loses the save as well: the customer presses one button and ends up
  // with neither a cart line nor a wishlist row, and nothing tells them which
  // half failed. Adding first makes the failure a no-op.
  //
  // The reverse risk -- added to cart, removal fails -- leaves the product in
  // both places, which is the harmless direction and is reported honestly.
  const added = await addToCart(productId, null, 1)
  if (!added.ok) {
    return { ok: false, error: added.error ?? 'הוספה לעגלה נכשלה.' }
  }

  const removed = await runRemoveFromWishlist(productId)
  if (!removed.ok) {
    return { ok: false, error: 'המוצר נוסף לעגלה, אך הסרתו מהמועדפים נכשלה.' }
  }
  return { ok: true }
}

/** The wishlist page's primary action: into the cart, out of the list. */
export async function moveWishlistItemToCart(productId: string): Promise<MoveToCartState> {
  return withActionContext('wishlist.move_to_cart', () => runMoveWishlistItemToCart(productId))
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
 * Folds the browser's guest list into the signed-in one, at login.
 *
 * WHY THIS IS NOT IN `auth/callback/route.ts` NEXT TO `mergeGuestCart`.
 * The guest cart lives in a cookie, so the server has it at the moment the
 * session is created. The guest wishlist lives in `localStorage`, which the
 * server has never seen and cannot read from a route handler. The merge has to
 * be initiated by the browser, and the provider does it the first time it
 * observes a session with a non-empty local list.
 *
 * The list is client-supplied and therefore untrusted, which costs nothing
 * here: `user_id` comes from the verified session, the ids are uuid-filtered
 * and capped, and the FK refuses anything that is not a real product. The worst
 * a forged list achieves is saving products the caller could have saved by
 * pressing hearts.
 */
export async function mergeGuestWishlist(
  guestProductIds: readonly string[],
): Promise<MergeGuestWishlistState> {
  return withActionContext('wishlist.merge_guest', () => runMergeGuestWishlist(guestProductIds))
}
