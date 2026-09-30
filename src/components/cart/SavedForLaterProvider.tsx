'use client'

import {
  type SavedForLaterState,
  type SavedForLaterStoreApi,
  createSavedForLaterStore,
} from '@/lib/cart/saved-for-later'
import { type ReactNode, createContext, useContext, useEffect, useRef } from 'react'
import { useStore } from 'zustand'

const SavedForLaterContext = createContext<SavedForLaterStoreApi | null>(null)

/**
 * Holds the saved-for-later store for the cart page.
 *
 * Mounted by `CartPageView` and not by a layout: the list is read on one
 * page, and a provider in the layout would put a `localStorage` read under
 * every route for a feature only /cart renders. The store is created with
 * `skipHydration` and read from an effect, for the same reason the cart
 * mirror is: the server-rendered HTML has no list, and painting one during
 * hydration would be a mismatch.
 */
export function SavedForLaterProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<SavedForLaterStoreApi | null>(null)
  if (storeRef.current === null) storeRef.current = createSavedForLaterStore()
  const store = storeRef.current

  useEffect(() => {
    let cancelled = false
    void Promise.resolve(store.persist.rehydrate()).then(() => {
      if (!cancelled) store.getState().markHydrated()
    })
    return () => {
      cancelled = true
    }
  }, [store])

  return <SavedForLaterContext.Provider value={store}>{children}</SavedForLaterContext.Provider>
}

/**
 * The store, or null outside the provider. Null and not a throw because
 * `CartLineItem` also renders in surfaces that have no list (the drawer, the
 * mini cart) and simply hides its "save" button there.
 */
export function useSavedForLaterStoreApi(): SavedForLaterStoreApi | null {
  return useContext(SavedForLaterContext)
}

export function useSavedForLater(): SavedForLaterState {
  const store = useContext(SavedForLaterContext)
  if (!store) throw new Error('useSavedForLater must be used within SavedForLaterProvider')
  return useStore(store)
}
