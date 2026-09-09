'use client'

import { useAuth } from '@/hooks/useAuth'
import {
  type GuestWishlist,
  WISHLIST_CHANGED_EVENT,
  WISHLIST_MAX_ITEMS,
  clearGuestWishlist,
  guestToggle,
  readGuestWishlist,
  writeGuestWishlist,
} from '@/lib/wishlist/guest-storage'
import {
  getMyWishlistProductIds,
  mergeGuestWishlist,
  removeFromWishlist,
  toggleWishlist,
} from '@/server/actions/wishlist'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * One saved-set for the whole page: the header counter, every card heart and
 * the product page all read this, and a toggle anywhere updates all of them in
 * the same commit.
 *
 * WHY A PROVIDER AND NOT PER-BUTTON STATE. The heart's answer is per session,
 * and every storefront route is a cached static shell, so the answer cannot be
 * rendered on the server -- it has to be fetched after hydration. The previous
 * button did that per instance: a category page with 24 cards fired 24 server
 * actions to paint 24 hearts, each re-reading the session cookie and querying
 * the same table. One bootstrap read returns the whole set, which is capped at
 * 100 uuids.
 *
 * OPTIMISTIC, AND IT ROLLS BACK. The set flips before the action is sent and
 * reverts if the server refuses. `useOptimistic` is deliberately not used: its
 * value snaps back when the transition ends, which is correct for a value
 * derived from a server-rendered prop and wrong here, where this state IS the
 * source of truth between navigations.
 *
 * SIGNED OUT IS A REAL WISHLIST, not a prompt to log in. It lives in
 * `localStorage` and is folded into the account list the first time this
 * provider sees a session, in the bootstrap effect below.
 */

export type WishlistContextValue = {
  /** Lowercased product uuids. */
  saved: ReadonlySet<string>
  count: number
  /** False until the first read resolves, so a heart can avoid painting empty. */
  ready: boolean
  isSaved: (productId: string) => boolean
  toggle: (productId: string) => Promise<{ ok: boolean; saved: boolean; error?: string }>
  remove: (productId: string) => Promise<{ ok: boolean; error?: string }>
  /** True while any write is in flight, for a disabled state. */
  pending: boolean
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

/**
 * The initial value, hoisted out of the hook call.
 *
 * Not a style preference. `useState<ReadonlySet<string>>(() => new Set<string>())`
 * puts `> ... <` on one line, which is the shape `scripts/latin-copy-scan.mjs`
 * reads as a JSX text node: the gate reported the words "new Set" as English
 * marketing copy. The scanner already documents that generics defeat it. One
 * shared empty set is also one allocation instead of one per mount; nothing
 * writes it, because every update builds a new Set from the current one.
 */
const EMPTY_SET: ReadonlySet<string> = new Set<string>()

const FULL_MESSAGE = `רשימת המועדפים מלאה (${WISHLIST_MAX_ITEMS} מוצרים).`

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [saved, setSaved] = useState<ReadonlySet<string>>(EMPTY_SET)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)

  // Which user id the current `saved` set belongs to. Sign-out has to empty the
  // set rather than leave the previous account's saves painted on the cards.
  const loadedFor = useRef<string | null | undefined>(undefined)
  const mergedFor = useRef<string | null>(null)

  const applyGuest = useCallback((list: GuestWishlist) => {
    setSaved(new Set(list.productIds))
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    const userId = user?.id ?? null
    if (loadedFor.current === userId) return
    loadedFor.current = userId

    if (userId === null) {
      applyGuest(readGuestWishlist())
      setReady(true)
      return
    }

    // Signed in. Merge whatever the browser was carrying, then take the
    // server's answer as the truth -- `mergeGuestWishlist` returns the ids it
    // ends up with, so the merge and the bootstrap are one round trip.
    const guest = readGuestWishlist()
    const run = async () => {
      if (guest.productIds.length > 0 && mergedFor.current !== userId) {
        mergedFor.current = userId
        const result = await mergeGuestWishlist(guest.productIds)
        if (cancelled) return
        // The local list is cleared only on a merge the server confirmed.
        // Clearing on failure would delete the customer's saves to fix nothing.
        if (result.ok) clearGuestWishlist()
        setSaved(new Set(result.ids))
        setReady(true)
        return
      }
      const ids = await getMyWishlistProductIds()
      if (cancelled) return
      setSaved(new Set(ids))
      setReady(true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [user, authLoading, applyGuest])

  // A second tab is a real case for a wishlist: people open products in tabs
  // and save from several of them. `storage` fires in the OTHER tabs, the
  // custom event fires in this one.
  useEffect(() => {
    if (user) return
    const onChange = () => applyGuest(readGuestWishlist())
    window.addEventListener(WISHLIST_CHANGED_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(WISHLIST_CHANGED_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [user, applyGuest])

  const toggle = useCallback<WishlistContextValue['toggle']>(
    async (productId) => {
      const id = productId.toLowerCase()

      if (!user) {
        const next = guestToggle(readGuestWishlist(), id)
        if (next.refusedFull) return { ok: false, saved: false, error: FULL_MESSAGE }
        applyGuest(writeGuestWishlist(next.list.productIds))
        return { ok: true, saved: next.saved }
      }

      const wasSaved = saved.has(id)
      const optimistic = new Set(saved)
      if (wasSaved) optimistic.delete(id)
      else optimistic.add(id)
      setSaved(optimistic)
      setPending(true)
      try {
        const result = await toggleWishlist(id)
        if (!result.ok) {
          // Roll back onto the CURRENT set rather than the snapshot above: a
          // second toggle may have committed while this one was in flight, and
          // restoring the snapshot would silently undo it.
          setSaved((current) => {
            const reverted = new Set(current)
            if (wasSaved) reverted.add(id)
            else reverted.delete(id)
            return reverted
          })
          return { ok: false, saved: wasSaved, error: result.error }
        }
        const confirmed = result.saved === true
        setSaved((current) => {
          const next = new Set(current)
          if (confirmed) next.add(id)
          else next.delete(id)
          return next
        })
        return { ok: true, saved: confirmed }
      } finally {
        setPending(false)
      }
    },
    [user, saved, applyGuest],
  )

  const remove = useCallback<WishlistContextValue['remove']>(
    async (productId) => {
      const id = productId.toLowerCase()
      if (!user) {
        const list = readGuestWishlist()
        applyGuest(writeGuestWishlist(list.productIds.filter((x) => x !== id)))
        return { ok: true }
      }
      const wasSaved = saved.has(id)
      setSaved((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      setPending(true)
      try {
        const result = await removeFromWishlist(id)
        if (!result.ok && wasSaved) {
          setSaved((current) => new Set(current).add(id))
          return { ok: false, error: result.error }
        }
        return { ok: true }
      } finally {
        setPending(false)
      }
    },
    [user, saved, applyGuest],
  )

  const value = useMemo<WishlistContextValue>(
    () => ({
      saved,
      count: saved.size,
      ready,
      isSaved: (productId: string) => saved.has(productId.toLowerCase()),
      toggle,
      remove,
      pending,
    }),
    [saved, ready, toggle, remove, pending],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

/**
 * Null outside the provider, on purpose and not by accident.
 *
 * The heart renders inside `ProductCard`, and `ProductCard` is used by admin
 * previews and by tests that mount a card on its own. Throwing there would turn
 * a missing provider into a blank page instead of a heart that does nothing, so
 * every consumer handles null and degrades to "not saved".
 */
export function useWishlist(): WishlistContextValue | null {
  return useContext(WishlistContext)
}
