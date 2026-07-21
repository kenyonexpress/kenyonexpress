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

export function CartProvider({
  children,
  initialCart,
}: {
  children: ReactNode
  initialCart: CartView
}) {
  const storeRef = useRef<CartStoreApi | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createCartStore(initialCart, showFeedback)
  }

  return <CartStoreContext.Provider value={storeRef.current}>{children}</CartStoreContext.Provider>
}

export function useCartStoreApi(): CartStoreApi {
  const store = useContext(CartStoreContext)
  if (!store) throw new Error('useCart must be used within CartProvider')
  return store
}

export function useCart(): CartStoreState {
  return useStore(useCartStoreApi())
}
