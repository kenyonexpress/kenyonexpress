'use client'

import type { CartView } from '@/lib/cart/types'
import {
  addToCart as addToCartAction,
  clearCart as clearCartAction,
  removeFromCart as removeFromCartAction,
  updateCartItem as updateCartItemAction,
} from '@/server/actions/cart'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useOptimistic,
  useState,
  useTransition,
} from 'react'
import { toast } from 'sonner'

type OptimisticAction =
  | { type: 'add'; productId: string; variantId: string | null; quantity: number }
  | { type: 'setQty'; productId: string; variantId: string | null; quantity: number }
  | { type: 'remove'; productId: string; variantId: string | null }
  | { type: 'replace'; cart: CartView }

function applyOptimistic(cart: CartView, action: OptimisticAction): CartView {
  switch (action.type) {
    case 'replace':
      return action.cart
    case 'add':
      return {
        ...cart,
        item_count: Math.min(99, cart.item_count + action.quantity),
      }
    case 'setQty': {
      const items =
        action.quantity === 0
          ? cart.items.filter(
              (i) =>
                !(
                  i.product_id === action.productId &&
                  (i.variant_id ?? null) === (action.variantId ?? null)
                ),
            )
          : cart.items.map((i) =>
              i.product_id === action.productId &&
              (i.variant_id ?? null) === (action.variantId ?? null)
                ? { ...i, quantity: action.quantity }
                : i,
            )
      return { ...cart, items, item_count: items.reduce((s, i) => s + i.quantity, 0) }
    }
    case 'remove': {
      const items = cart.items.filter(
        (i) =>
          !(
            i.product_id === action.productId &&
            (i.variant_id ?? null) === (action.variantId ?? null)
          ),
      )
      return { ...cart, items, item_count: items.reduce((s, i) => s + i.quantity, 0) }
    }
    default:
      return cart
  }
}

type CartContextValue = {
  cart: CartView
  isPending: boolean
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  addToCart: (
    productId: string,
    variantId: string | null,
    quantity: number,
    productName?: string,
  ) => Promise<void>
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => Promise<void>
  removeItem: (productId: string, variantId: string | null) => Promise<void>
  clear: () => Promise<void>
  setCart: (cart: CartView) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({
  children,
  initialCart,
}: {
  children: ReactNode
  initialCart: CartView
}) {
  const [cart, setCart] = useState(initialCart)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [optimisticCart, dispatchOptimistic] = useOptimistic(cart, applyOptimistic)
  const [isPending, startTransition] = useTransition()

  const commitCart = useCallback(
    (next: CartView) => {
      // useOptimistic dispatch must run inside a transition (React 19 warning
      // when commitCart is called from an effect, e.g. CartPageView hydration).
      startTransition(() => {
        setCart(next)
        dispatchOptimistic({ type: 'replace', cart: next })
      })
    },
    [dispatchOptimistic],
  )

  const addToCart = useCallback(
    (productId: string, variantId: string | null, quantity: number, productName?: string) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          dispatchOptimistic({ type: 'add', productId, variantId, quantity })
          const result = await addToCartAction(productId, variantId, quantity)
          if (result.ok) {
            commitCart(result.cart)
            toast.success(productName ? `${productName} נוסף לעגלה` : 'נוסף לעגלה')
            setDrawerOpen(true)
          } else {
            dispatchOptimistic({ type: 'replace', cart })
            toast.error(result.error)
          }
          resolve()
        })
      }),
    [cart, commitCart, dispatchOptimistic],
  )

  const updateQuantity = useCallback(
    (productId: string, variantId: string | null, quantity: number) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          dispatchOptimistic({ type: 'setQty', productId, variantId, quantity })
          const result = await updateCartItemAction(productId, variantId, quantity)
          if (result.ok) {
            commitCart(result.cart)
          } else {
            dispatchOptimistic({ type: 'replace', cart })
            toast.error(result.error)
          }
          resolve()
        })
      }),
    [cart, commitCart, dispatchOptimistic],
  )

  const removeItem = useCallback(
    (productId: string, variantId: string | null) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          dispatchOptimistic({ type: 'remove', productId, variantId })
          const result = await removeFromCartAction(productId, variantId)
          if (result.ok) {
            commitCart(result.cart)
            toast.success('הפריט הוסר מהעגלה')
          } else {
            dispatchOptimistic({ type: 'replace', cart })
            toast.error(result.error)
          }
          resolve()
        })
      }),
    [cart, commitCart, dispatchOptimistic],
  )

  const clear = useCallback(
    () =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          dispatchOptimistic({ type: 'replace', cart: { ...cart, items: [], item_count: 0 } })
          const result = await clearCartAction()
          if (result.ok) {
            commitCart(result.cart)
          } else {
            dispatchOptimistic({ type: 'replace', cart })
            toast.error(result.error)
          }
          resolve()
        })
      }),
    [cart, commitCart, dispatchOptimistic],
  )

  return (
    <CartContext.Provider
      value={{
        cart: optimisticCart,
        isPending,
        drawerOpen,
        openDrawer: () => setDrawerOpen(true),
        closeDrawer: () => setDrawerOpen(false),
        toggleDrawer: () => setDrawerOpen((v) => !v),
        addToCart,
        updateQuantity,
        removeItem,
        clear,
        setCart: commitCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
