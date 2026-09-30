import { toggleWishlist } from '@/server/actions/reviews'
import { getMyWishlistIds, removeFromWishlist } from '@/server/actions/wishlist'
import { create } from 'zustand'

/**
 * The browser's one copy of "which products has this shopper saved".
 *
 * WHY A STORE AND NOT STATE IN EACH HEART. The heart is now on every product
 * card, and a category page paints forty of them. Each `WishlistButton` used
 * to ask the server for its own product after paint, which is forty server
 * actions for one boolean each, on every navigation. The store asks once per
 * page load (`load` dedupes concurrent callers behind one promise), and every
 * heart reads the answer. The toggle is optimistic and rolls back on refusal,
 * and the same set feeds the header badge, so saving on a card and the count
 * in the masthead agree without a second read.
 *
 * SIGNED OUT IS A STATE, NOT AN ERROR. A visitor without a session gets
 * `signed_out` from the first load and the heart sends them to sign in with a
 * return path, instead of round-tripping to hear "צריך להתחבר" every click.
 *
 * Module-level, not in a provider, on purpose: the store is per browser tab
 * and there is exactly one shopper per tab; a provider would only add a
 * boundary every card has to be under. The cart is different (it has an
 * initial server value and a persisted mirror); this has neither.
 */

export type WishlistStatus = 'idle' | 'loading' | 'ready' | 'signed_out'

export type WishlistToggleOutcome =
  | { ok: true; saved: boolean }
  | { ok: false; signedOut: true }
  | { ok: false; signedOut?: false; error: string }

export interface WishlistClientState {
  status: WishlistStatus
  ids: ReadonlySet<string>
  /** One server read per page load; safe to call from every heart. */
  load: () => Promise<void>
  /** Optimistic flip with rollback; refuses locally when signed out. */
  toggle: (productId: string) => Promise<WishlistToggleOutcome>
  /** Optimistic delete with rollback; used by "move to cart" and the list page. */
  remove: (productId: string) => Promise<WishlistToggleOutcome>
  /** Replace the set from a fuller read (the list page has the full view). */
  replace: (ids: readonly string[], signedIn: boolean) => void
  /** Forget everything, e.g. after sign-out. */
  reset: () => void
}

let inflight: Promise<void> | null = null

function withId(set: ReadonlySet<string>, id: string, present: boolean): ReadonlySet<string> {
  if (set.has(id) === present) return set
  const next = new Set(set)
  if (present) next.add(id)
  else next.delete(id)
  return next
}

export const useWishlistStore = create<WishlistClientState>((set, get) => ({
  status: 'idle',
  ids: new Set<string>(),

  load: () => {
    const { status } = get()
    if (status === 'ready' || status === 'signed_out') return Promise.resolve()
    if (inflight) return inflight
    set({ status: 'loading' })
    inflight = getMyWishlistIds()
      .then((state) => {
        set({
          status: state.signedIn ? 'ready' : 'signed_out',
          ids: new Set(state.ids),
        })
      })
      .catch(() => {
        // A failed read leaves the hearts empty and lets a later call retry.
        set({ status: 'idle' })
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  },

  toggle: async (productId) => {
    const before = get()
    if (before.status === 'signed_out') return { ok: false, signedOut: true }
    const wasSaved = before.ids.has(productId)
    set({ ids: withId(before.ids, productId, !wasSaved) })
    const result = await toggleWishlist(productId)
    if (result.ok) {
      const saved = result.saved === true
      set((s) => ({ ids: withId(s.ids, productId, saved), status: 'ready' }))
      return { ok: true, saved }
    }
    set((s) => ({ ids: withId(s.ids, productId, wasSaved) }))
    if (result.reason === 'signed_out') {
      set({ status: 'signed_out', ids: new Set() })
      return { ok: false, signedOut: true }
    }
    return { ok: false, error: result.error ?? 'הפעולה נכשלה.' }
  },

  remove: async (productId) => {
    const before = get()
    if (before.status === 'signed_out') return { ok: false, signedOut: true }
    const wasSaved = before.ids.has(productId)
    set({ ids: withId(before.ids, productId, false) })
    const result = await removeFromWishlist(productId)
    if (result.ok) return { ok: true, saved: false }
    set((s) => ({ ids: withId(s.ids, productId, wasSaved) }))
    return { ok: false, error: result.error }
  },

  replace: (ids, signedIn) => {
    set({ ids: new Set(ids), status: signedIn ? 'ready' : 'signed_out' })
  },

  reset: () => {
    inflight = null
    set({ status: 'idle', ids: new Set() })
  },
}))

/** Selector: is this product saved? Re-renders only when its own answer changes. */
export function useIsWishlisted(productId: string): boolean {
  return useWishlistStore((s) => s.ids.has(productId))
}

/** Selector: how many products are saved (0 while signed out or unloaded). */
export function useWishlistCount(): number {
  return useWishlistStore((s) => s.ids.size)
}

/** The sign-in URL that brings the shopper back to where the heart was. */
export function loginHrefForWishlist(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath || '/wishlist')}`
}
