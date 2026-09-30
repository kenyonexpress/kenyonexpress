'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { isInStock } from '@/lib/wishlist/alerts'
import { mintShareToken } from '@/lib/wishlist/share-token'
import { revalidatePath } from 'next/cache'

/**
 * The wishlist page's actions, on the USER client on purpose, the same rule
 * `reviews.ts` states for the heart itself: RLS (154 on `wishlists`, 248 on
 * `wishlist_shares`) is the enforcement, and this file only shapes the answer
 * for a signed-out caller and translates refusals into Hebrew.
 *
 * WHY A SEPARATE `remove` AND NOT THE TOGGLE. "Move to cart" removes the row
 * AFTER the cart accepted the product; if the heart's state on screen were
 * stale, a toggle would re-ADD the product the shopper just moved. A remove
 * is idempotent: deleting a row that is already gone is a success.
 *
 * DEGRADES, NEVER BREAKS, while the migrations are unapplied: `wishlists`
 * missing (PGRST205) reads as an empty list, `wishlist_shares` missing reads
 * as "share not available", and the page hides the share card.
 */

const UUID = /^[0-9a-f-]{36}$/i

export interface WishlistIdsState {
  signedIn: boolean
  ids: string[]
}

async function runGetMyWishlistIds(): Promise<WishlistIdsState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { signedIn: false, ids: [] }

  const { data, error } = await supabase.from('wishlists' as never).select('product_id')
  if (error) return { signedIn: true, ids: [] }
  return {
    signedIn: true,
    ids: ((data ?? []) as unknown as { product_id: string }[]).map((row) => row.product_id),
  }
}

/**
 * Every product id the signed-in shopper has saved, in one round trip. The
 * hearts on a grid of forty cards used to ask forty times; the client store
 * asks once and answers all of them.
 */
export async function getMyWishlistIds(): Promise<WishlistIdsState> {
  return withActionContext('wishlist.ids', () => runGetMyWishlistIds())
}

export interface WishlistViewItem {
  productId: string
  savedAt: string
  name: string
  slug: string | null
  /** Shekels as the catalogue stores them; formatted by `shekelsFromIlsRounded`. */
  priceIls: number | null
  fullPriceIls: number | null
  image: string | null
  /** Active, undeleted, and not sold out: the product can go to the cart. */
  available: boolean
  soldOut: boolean
}

export type WishlistShareState =
  | { available: false }
  | { available: true; token: string | null; enabled: boolean }

export type WishlistViewState =
  | { signedIn: false }
  | { signedIn: true; items: WishlistViewItem[]; share: WishlistShareState }

interface WishlistRow {
  product_id: string
  created_at: string
  product: {
    name_he: string | null
    slug: string | null
    price_ils: number | null
    full_price: number | null
    images: unknown
    stock_quantity: number | null
    status: string | null
    deleted_at: string | null
  } | null
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string' && src.length > 0)
  return first ?? null
}

function toViewItem(row: WishlistRow): WishlistViewItem {
  const product = row.product
  const live = product !== null && product.deleted_at === null && product.status === 'active'
  const inStock = product ? isInStock(product.stock_quantity, product.status) : false
  return {
    productId: row.product_id,
    savedAt: row.created_at,
    name: product?.name_he ?? 'מוצר',
    slug: live ? (product?.slug ?? null) : null,
    priceIls: product?.price_ils ?? null,
    fullPriceIls: product?.full_price ?? null,
    image: firstImage(product?.images),
    available: live && inStock,
    soldOut: live && !inStock,
  }
}

interface ShareRow {
  token: string
  enabled: boolean
}

async function readShare(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<WishlistShareState> {
  const { data, error } = await supabase
    .from('wishlist_shares' as never)
    .select('token, enabled')
    .maybeSingle()
  if (error) return { available: false }
  const row = data as unknown as ShareRow | null
  return { available: true, token: row?.token ?? null, enabled: row?.enabled === true }
}

async function runGetMyWishlistView(): Promise<WishlistViewState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { signedIn: false }

  const [{ data, error }, share] = await Promise.all([
    supabase
      .from('wishlists' as never)
      .select(
        'product_id, created_at, product:products(name_he, slug, price_ils, full_price, images, stock_quantity, status, deleted_at)',
      )
      .order('created_at', { ascending: false }),
    readShare(supabase),
  ])
  if (error) return { signedIn: true, items: [], share }
  const rows = (data ?? []) as unknown as WishlistRow[]
  return { signedIn: true, items: rows.map(toViewItem), share }
}

/** Everything `/wishlist` renders for the signed-in shopper, in one read. */
export async function getMyWishlistView(): Promise<WishlistViewState> {
  return withActionContext('wishlist.view', () => runGetMyWishlistView())
}

export type WishlistRemoveResult = { ok: true } | { ok: false; error: string }

async function runRemoveFromWishlist(productId: string): Promise<WishlistRemoveResult> {
  if (typeof productId !== 'string' || !UUID.test(productId)) {
    return { ok: false, error: 'מוצר לא תקין.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לערוך את הרשימה.' }

  // The same bucket as the heart: it is the same gesture on a different page.
  const allowed = await checkRateLimit(`wishlist-toggle:${user.id}`, 60, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי פעולות. נסה שוב בעוד רגע.' }

  const { error } = await supabase
    .from('wishlists' as never)
    .delete()
    .eq('product_id', productId)
    .eq('user_id', user.id)
  if (error) {
    if (error.code === TABLE_MISSING) return { ok: true }
    return { ok: false, error: 'ההסרה נכשלה. נסה שוב.' }
  }
  revalidatePath('/wishlist')
  return { ok: true }
}

/** Idempotent: a row already gone is a success, which "move to cart" relies on. */
export async function removeFromWishlist(productId: string): Promise<WishlistRemoveResult> {
  return withActionContext('wishlist.remove', () => runRemoveFromWishlist(productId))
}

export type WishlistShareCommand = 'enable' | 'disable' | 'rotate'

export type WishlistShareResult =
  | { ok: true; share: WishlistShareState }
  | { ok: false; error: string }

const SHARE_NOT_OPEN = 'שיתוף הרשימה עוד לא פתוח.'
const SHARE_FAILED = 'הפעולה נכשלה. נסה שוב.'

async function runSetWishlistShare(command: WishlistShareCommand): Promise<WishlistShareResult> {
  if (command !== 'enable' && command !== 'disable' && command !== 'rotate') {
    return { ok: false, error: 'פעולה לא מוכרת.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לשתף את הרשימה.' }

  const allowed = await checkRateLimit(`wishlist-share:${user.id}`, 20, 3600)
  if (!allowed) return { ok: false, error: 'יותר מדי פעולות. נסה שוב בעוד רגע.' }

  const { data: existing, error: readError } = await supabase
    .from('wishlist_shares' as never)
    .select('token, enabled')
    .maybeSingle()
  if (readError) {
    return { ok: false, error: readError.code === TABLE_MISSING ? SHARE_NOT_OPEN : SHARE_FAILED }
  }
  const current = existing as unknown as ShareRow | null

  if (command === 'disable') {
    if (!current) return { ok: true, share: { available: true, token: null, enabled: false } }
    const { error } = await supabase
      .from('wishlist_shares' as never)
      .update({ enabled: false } as never)
      .eq('user_id', user.id)
    if (error) return { ok: false, error: SHARE_FAILED }
    return { ok: true, share: { available: true, token: current.token, enabled: false } }
  }

  if (command === 'enable' && current) {
    if (current.enabled) {
      return { ok: true, share: { available: true, token: current.token, enabled: true } }
    }
    const { error } = await supabase
      .from('wishlist_shares' as never)
      .update({ enabled: true } as never)
      .eq('user_id', user.id)
    if (error) return { ok: false, error: SHARE_FAILED }
    return { ok: true, share: { available: true, token: current.token, enabled: true } }
  }

  // `enable` with no row yet, or `rotate`: a fresh token, switched on. The
  // upsert on the primary key makes "rotate" replace the old token in place,
  // which is what kills the old link.
  const token = mintShareToken()
  const { error } = await supabase
    .from('wishlist_shares' as never)
    .upsert({ user_id: user.id, token, enabled: true } as never, { onConflict: 'user_id' } as never)
  if (error) {
    return { ok: false, error: error.code === TABLE_MISSING ? SHARE_NOT_OPEN : SHARE_FAILED }
  }
  return { ok: true, share: { available: true, token, enabled: true } }
}

/**
 * Mint, switch off, switch back on, or replace the share link. `enable` on an
 * existing row restores the SAME URL the shopper may already have posted;
 * `rotate` is the deliberate way to kill it.
 */
export async function setWishlistShare(
  command: WishlistShareCommand,
): Promise<WishlistShareResult> {
  return withActionContext('wishlist.share', () => runSetWishlistShare(command))
}
