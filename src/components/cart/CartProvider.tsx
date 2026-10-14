'use client'

import {
  type CartFeedback,
  type CartStoreApi,
  type CartStoreState,
  createCartStore,
} from '@/lib/cart/store'
import { EMPTY_CART } from '@/lib/cart/types'
import type { CartView } from '@/lib/cart/types'
import { notify } from '@/lib/ui/toast'
import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

// `notify` imports sonner on the first call (lib/ui/toast.ts). This provider
// is in every storefront route's first load, and a static `toast` import here
// was 40 KB raw / 11.8 KB gzipped of sonner before any feedback existed to
// show; the Toaster itself was already deferred in DeferredStoreChrome.
function showFeedback(feedback: CartFeedback): void {
  if (feedback.kind === 'error') {
    notify('error', feedback.message)
  } else if (feedback.kind === 'queued') {
    // Neither a success nor a failure: the write is kept and will land later.
    notify('info', feedback.message)
  } else {
    notify('success', feedback.message)
  }
}

const CartStoreContext = createContext<CartStoreApi | null>(null)

/**
 * Holds the cart store for a route group's chrome.
 *
 * `initialCart` and `isAuthenticated` are OPTIONAL, and the layouts that mount
 * this pass neither. That is deliberate and it is the whole reason the store
 * front can be prerendered: reading the cart means reading a cookie, and a
 * layout that awaits a cookie before it renders makes every route beneath it
 * uncacheable. The values arrive instead from `<CartBootstrap>`, a client
 * fetch of `/api/cart` after hydration, which calls `setCart` /
 * `setAuthenticated` once it resolves.
 *
 * Passing them here still works and is what the tests do; it just costs the
 * static shell of everything below.
 */
export function CartProvider({
  children,
  initialCart = EMPTY_CART,
  isAuthenticated = false,
}: {
  children: ReactNode
  initialCart?: CartView
  isAuthenticated?: boolean
}) {
  const storeRef = useRef<CartStoreApi | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createCartStore(initialCart, showFeedback, isAuthenticated)
  }
  const store = storeRef.current

  // The cart mirror is created with `skipHydration`, so this is what reads it.
  // It runs after React has matched the server and client trees, which is the
  // point: rehydrating during render would put a badge on screen that the
  // server-rendered HTML does not have.
  useEffect(() => {
    void store.persist.rehydrate()
  }, [store])

  return <CartStoreContext.Provider value={store}>{children}</CartStoreContext.Provider>
}

/**
 * Whether the `localStorage` mirror has been read in this tab (UX27).
 *
 * Until it has, `mirrorCount` is the server-rendered zero and says nothing;
 * after it has, a zero means "this device holds no cart", which is as much of
 * an answer as a count, and the cart page may show its empty state on it
 * without waiting for the server. Read off the persist middleware's own
 * hydration flag rather than a field in the store: a field would be `set()`
 * on hydration, and the middleware writes the mirror key on every `set`, so
 * every first visit would have written a key for a cart that does not exist
 * (cart-line-remove-animation.test pins "nothing written until the exit").
 * False on the server and on the first client render alike, so there is no
 * hydration mismatch; the effect flips it.
 */
export function useCartMirrorHydrated(): boolean {
  const store = useCartStoreApi()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (store.persist.hasHydrated()) {
      setHydrated(true)
      return
    }
    return store.persist.onFinishHydration(() => setHydrated(true))
  }, [store])
  return hydrated
}

export function useCartAuth(): boolean {
  return useStore(useCartStoreApi(), (s) => s.isAuthenticated)
}

export function useCartStoreApi(): CartStoreApi {
  const store = useContext(CartStoreContext)
  if (!store) throw new Error('useCart must be used within CartProvider')
  return store
}

export function useCart(): CartStoreState {
  return useStore(useCartStoreApi())
}
