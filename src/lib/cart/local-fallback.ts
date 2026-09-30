import { CART_EXPIRY_DAYS } from '@/lib/cart/coupon-cookie'
import type { CartView, CartViewItem } from '@/lib/cart/types'

/**
 * `localStorage` key of the cart's LINE fallback, the second and last cart key
 * in the browser. The first, `ke_cart_mirror_v1` in `store.ts`, holds one
 * integer for the badge. This one holds the last cart the server confirmed, so
 * that a shopper whose `/api/cart` request fails (a train tunnel, a dead
 * Supabase, a PWA opened with no network) sees the lines they had rather than
 * an empty cart with a badge that insists on "3".
 *
 * WHAT IT MAY BE USED FOR: display, and only until the server answers. The
 * architecture's rule for browser-side cart state is "never trusted for price
 * or checkout" (docs/ARCHITECTURE-CART-CHECKOUT.md §2.1), and this module keeps
 * it in three ways rather than by a comment:
 *
 *  1. The store marks a restored snapshot with `fallbackActive`, every
 *     checkout button reads that flag and refuses, and every cart surface
 *     shows a banner saying the prices are as of the last connection.
 *  2. The first server answer overwrites it unconditionally (`CartBootstrap`
 *     re-fetches on `online`). E14 in the doc: "server cart wins on hydrate".
 *  3. Nothing on the server ever reads it. Checkout rebuilds the cart from
 *     `public.carts` and re-prices every line; a snapshot edited by hand can
 *     change what this browser SHOWS and nothing about what it is CHARGED.
 *
 * It is a separate key rather than a second field in the mirror because the
 * mirror's contract is "an integer and nothing else", and that contract is
 * asserted by a test. Widening it would have turned a guarantee into a habit.
 */
export const CART_FALLBACK_KEY = 'ke_cart_fallback_v1'

/**
 * A snapshot older than this is not restored. It is the row's own lifetime:
 * `saveCartItems` pushes `expires_at` out by `CART_EXPIRY_DAYS` on every
 * write, and the reaper deletes the row after that. A snapshot older than the
 * row it describes would be showing lines the server no longer holds.
 */
export const CART_FALLBACK_MAX_AGE_MS = CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000

type Envelope = { v: 1; saved_at: number; cart: CartView }

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    const store = window.localStorage
    if (!store || typeof store.getItem !== 'function') return null
    return store
  } catch {
    // Safari in private mode and some embedded WebViews throw on the getter
    // itself. A cart with no fallback is the pre-existing behaviour, not a bug.
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isViewItem(value: unknown): value is CartViewItem {
  if (!isRecord(value)) return false
  return (
    typeof value.product_id === 'string' &&
    (typeof value.variant_id === 'string' || value.variant_id === null) &&
    Number.isInteger(value.quantity) &&
    (value.quantity as number) > 0 &&
    typeof value.name_he === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.image_url === 'string' || value.image_url === null) &&
    Number.isInteger(value.unit_price) &&
    Number.isInteger(value.line_total) &&
    (value.type === 'physical' || value.type === 'coupon') &&
    typeof value.available === 'boolean'
  )
}

/**
 * Whether a parsed value is a cart this module wrote. Structural, not deep:
 * the money fields are checked to be integers (agorot, never a float, the
 * project's standing rule), the lines to be renderable, and everything else
 * to be present. A snapshot that fails is dropped, never "repaired".
 */
export function isFallbackCart(value: unknown): value is CartView {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.items) || !value.items.every(isViewItem)) return false
  for (const key of [
    'item_count',
    'subtotal',
    'discount',
    'total',
    'platform_fee',
    'supplier_due',
    'balance_due_at_business',
    'cashback',
  ]) {
    if (!Number.isInteger(value[key])) return false
  }
  return typeof value.id === 'string' || value.id === null
}

/**
 * Records the cart the server just confirmed. An EMPTY cart removes the key:
 * an empty fallback has nothing to show, and leaving the previous lines behind
 * would resurrect a cart the shopper (or another tab) deliberately emptied the
 * next time the network dropped.
 */
export function writeCartFallback(cart: CartView, now: number = Date.now()): void {
  const store = storage()
  if (!store) return
  try {
    if (cart.items.length === 0) {
      store.removeItem(CART_FALLBACK_KEY)
      return
    }
    const envelope: Envelope = { v: 1, saved_at: now, cart }
    store.setItem(CART_FALLBACK_KEY, JSON.stringify(envelope))
  } catch {
    // Quota exceeded or storage disabled. The cart on screen is unaffected;
    // only the next offline open loses its lines, which is where we started.
  }
}

/** The last confirmed cart, or null when there is none worth showing. */
export function readCartFallback(now: number = Date.now()): CartView | null {
  const store = storage()
  if (!store) return null
  let raw: string | null
  try {
    raw = store.getItem(CART_FALLBACK_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearCartFallback()
    return null
  }
  if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.saved_at !== 'number') {
    clearCartFallback()
    return null
  }
  if (now - parsed.saved_at > CART_FALLBACK_MAX_AGE_MS || parsed.saved_at > now) {
    clearCartFallback()
    return null
  }
  if (!isFallbackCart(parsed.cart) || parsed.cart.items.length === 0) {
    clearCartFallback()
    return null
  }
  return parsed.cart
}

export function clearCartFallback(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(CART_FALLBACK_KEY)
  } catch {
    // Same reasoning as the write: nothing on screen depends on this.
  }
}
