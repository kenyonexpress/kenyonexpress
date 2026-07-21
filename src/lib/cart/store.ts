import type { CartView } from '@/lib/cart/types'
import {
  addToCart as addToCartAction,
  clearCart as clearCartAction,
  removeFromCart as removeFromCartAction,
  updateCartItem as updateCartItemAction,
} from '@/server/actions/cart'
import { createStore } from 'zustand/vanilla'

export type CartOptimisticAction =
  | { type: 'add'; productId: string; variantId: string | null; quantity: number }
  | { type: 'setQty'; productId: string; variantId: string | null; quantity: number }
  | { type: 'remove'; productId: string; variantId: string | null }
  | { type: 'replace'; cart: CartView }

export function applyOptimistic(cart: CartView, action: CartOptimisticAction): CartView {
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

export type CartFeedback =
  | { kind: 'added'; message: string }
  | { kind: 'removed'; message: string }
  | { kind: 'error'; message: string }

export interface CartStoreState {
  /** Optimistic view rendered by the UI. */
  cart: CartView
  /** Last server-confirmed cart (rollback target). */
  serverCart: CartView
  pendingOps: number
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

export type CartStoreApi = ReturnType<typeof createCartStore>

/**
 * One store instance per CartProvider mount (never a module singleton: module
 * state on the server is shared across requests and would leak carts between
 * users during SSR).
 */
export function createCartStore(
  initialCart: CartView,
  onFeedback: (feedback: CartFeedback) => void = () => undefined,
) {
  return createStore<CartStoreState>()((set, get) => {
    const begin = (action: CartOptimisticAction): CartView => {
      const rollback = get().serverCart
      set((state) => ({
        cart: applyOptimistic(state.cart, action),
        pendingOps: state.pendingOps + 1,
        isPending: true,
      }))
      return rollback
    }

    const settle = (confirmed: CartView | null, rollback: CartView): void => {
      set((state) => {
        const pendingOps = Math.max(0, state.pendingOps - 1)
        const next = confirmed ?? rollback
        return {
          cart: next,
          serverCart: confirmed ?? state.serverCart,
          pendingOps,
          isPending: pendingOps > 0,
        }
      })
    }

    return {
      cart: initialCart,
      serverCart: initialCart,
      pendingOps: 0,
      isPending: false,
      drawerOpen: false,
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),

      addToCart: async (productId, variantId, quantity, productName) => {
        const rollback = begin({ type: 'add', productId, variantId, quantity })
        const result = await addToCartAction(productId, variantId, quantity)
        if (result.ok) {
          settle(result.cart, rollback)
          onFeedback({
            kind: 'added',
            message: productName ? `${productName} נוסף לעגלה` : 'נוסף לעגלה',
          })
          set({ drawerOpen: true })
        } else {
          settle(null, rollback)
          onFeedback({ kind: 'error', message: result.error })
        }
      },

      updateQuantity: async (productId, variantId, quantity) => {
        const rollback = begin({ type: 'setQty', productId, variantId, quantity })
        const result = await updateCartItemAction(productId, variantId, quantity)
        if (result.ok) {
          settle(result.cart, rollback)
        } else {
          settle(null, rollback)
          onFeedback({ kind: 'error', message: result.error })
        }
      },

      removeItem: async (productId, variantId) => {
        const rollback = begin({ type: 'remove', productId, variantId })
        const result = await removeFromCartAction(productId, variantId)
        if (result.ok) {
          settle(result.cart, rollback)
          onFeedback({ kind: 'removed', message: 'הפריט הוסר מהעגלה' })
        } else {
          settle(null, rollback)
          onFeedback({ kind: 'error', message: result.error })
        }
      },

      clear: async () => {
        const rollback = get().serverCart
        set((state) => ({
          cart: { ...state.cart, items: [], item_count: 0 },
          pendingOps: state.pendingOps + 1,
          isPending: true,
        }))
        const result = await clearCartAction()
        if (result.ok) {
          settle(result.cart, rollback)
        } else {
          settle(null, rollback)
          onFeedback({ kind: 'error', message: result.error })
        }
      },

      setCart: (cart) => set({ cart, serverCart: cart }),
    }
  })
}
