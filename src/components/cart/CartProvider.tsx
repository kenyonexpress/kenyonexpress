'use client'

import {
  type CartFeedback,
  type CartStoreApi,
  type CartStoreState,
  createCartStore,
} from '@/lib/cart/store'
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
 * Whether the visitor is signed in, for the parts of the cart UI that have to
 * send a guest through Google before checkout. Defaults to false: treating an
 * unknown visitor as a guest costs one extra sign-in prompt, while the other
 * default sends them to a route the proxy bounces.
 */
const CartAuthContext = createContext<boolean>(false)

export function CartProvider({
  children,
  initialCart,
  isAuthenticated = false,
}: {
  children: ReactNode
  initialCart: CartView
  isAuthenticated?: boolean
}) {
  const storeRef = useRef<CartStoreApi | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createCartStore(initialCart, showFeedback)
  }

  return (
    <CartStoreContext.Provider value={storeRef.current}>
      <CartAuthContext.Provider value={isAuthenticated}>{children}</CartAuthContext.Provider>
    </CartStoreContext.Provider>
  )
}

export function useCartAuth(): boolean {
  return useContext(CartAuthContext)
}

export function useCartStoreApi(): CartStoreApi {
  const store = useContext(CartStoreContext)
  if (!store) throw new Error('useCart must be used within CartProvider')
  return store
}

export function useCart(): CartStoreState {
  return useStore(useCartStoreApi())
}
