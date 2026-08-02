'use client'

import {
  type CartFeedback,
  type CartStoreApi,
  type CartStoreState,
  createCartStore,
} from '@/lib/cart/store'
import { EMPTY_CART } from '@/lib/cart/types'
import type { CartView } from '@/lib/cart/types'
import { type ReactNode, createContext, useContext, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from 'zustand'

function showFeedback(feedback: CartFeedback): void {
  if (feedback.kind === 'error') {
    toast.error(feedback.message)
  } else {
    toast.success(feedback.message)
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
 * uncacheable. The values arrive instead from `<CartBootstrap>`, a streamed
 * hole, which calls `setCart` / `setAuthenticated` once it resolves.
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

  return <CartStoreContext.Provider value={storeRef.current}>{children}</CartStoreContext.Provider>
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
