import type { CartView } from '@/lib/cart/types'
import {
  addToCart as addToCartAction,
  clearCart as clearCartAction,
  removeFromCart as removeFromCartAction,
  updateCartItem as updateCartItemAction,
} from '@/server/actions/cart'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

/**
 * `localStorage` key of the cart mirror, named by
 * `docs/ARCHITECTURE-CART-CHECKOUT.md`.
 *
 * WHAT IS IN IT: one integer, the item count. Nothing else, and specifically no
 * price and no line. The doc's rule is "optimistic UX only, never trusted for
 * price or checkout", and the way to keep a rule like that is to make the
 * stored shape incapable of breaking it rather than to write it down. There is
 * no money in this key, so no stale money can come out of it.
 *
 * WHAT IT IS FOR: since the `cacheComponents` work, no store layout awaits the
 * cart -- reading the cookie would make every route below it uncacheable -- so
 * `initialCart` is empty and the real one arrives from `<CartBootstrap>`, a
 * client fetch of `/api/cart`, one network round trip after hydration. Until then a returning
 * shopper saw an empty badge over a cart that has things in it. The mirror
 * covers exactly that window and is overwritten by the first server answer.
 */
export const CART_MIRROR_KEY = 'ke_cart_mirror_v1'

/**
 * What the badge should show right now.
 *
 * Before the server has answered, the mirror is allowed to speak. After it has,
 * the server is the only voice: an item removed in another tab must not be kept
 * alive on this one by a number in `localStorage`.
 */
export function displayItemCount(state: CartStoreState): number {
  if (state.serverConfirmed) return state.cart.item_count
  return Math.max(state.cart.item_count, state.mirrorCount)
}

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
  /**
   * Whether the visitor is signed in, for the parts of the cart UI that send a
   * guest through Google before checkout.
   *
   * It lives in the store rather than in a React context because it arrives at
   * the same moment the cart does, and from the same place: a streamed hole in
   * the layout, after the shell has already been sent. A context value set by
   * the provider cannot be corrected by a child that resolves later.
   *
   * `false` until that hole resolves. Treating an unknown visitor as a guest
   * costs one extra sign-in prompt; the other default sends them to a route the
   * proxy bounces.
   */
  isAuthenticated: boolean
  setAuthenticated: (isAuthenticated: boolean) => void
  /**
   * The persisted item count. The only field written to `localStorage`.
   * Read through `displayItemCount`, never on its own.
   */
  mirrorCount: number
  /** Whether a server cart has landed. Never persisted: it is about this tab. */
  serverConfirmed: boolean
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
  initialAuthenticated = false,
) {
  const creator = (
    set: (
      partial: Partial<CartStoreState> | ((state: CartStoreState) => Partial<CartStoreState>),
    ) => void,
    get: () => CartStoreState,
  ): CartStoreState => {
    const begin = (action: CartOptimisticAction): CartView => {
      const rollback = get().serverCart
      set((state) => {
        const cart = applyOptimistic(state.cart, action)
        return {
          cart,
          // The mirror follows the optimistic view, not just the confirmed one.
          // Reloading in the second between pressing "add" and the action
          // returning is a real thing shoppers do, and the badge should survive
          // it; the server answer that follows corrects it either way.
          mirrorCount: cart.item_count,
          pendingOps: state.pendingOps + 1,
          isPending: true,
        }
      })
      return rollback
    }

    const settle = (confirmed: CartView | null, rollback: CartView): void => {
      set((state) => {
        const pendingOps = Math.max(0, state.pendingOps - 1)
        const next = confirmed ?? rollback
        return {
          cart: next,
          serverCart: confirmed ?? state.serverCart,
          mirrorCount: next.item_count,
          serverConfirmed: confirmed !== null ? true : state.serverConfirmed,
          pendingOps,
          isPending: pendingOps > 0,
        }
      })
    }

    /**
     * A server action that threw instead of returning a result.
     *
     * Every operation below reports a returned `{ ok: false }`, and none of
     * them reported a rejection: the optimistic count stayed on screen, no
     * toast appeared, and the shopper was left looking at an item that was
     * never stored. That is what happened when `createAdminClient()` could not
     * authenticate — the guest add-to-cart threw, `AddToCartButton`'s `finally`
     * cleared the spinner, and the failure was invisible on both sides. It cost
     * an afternoon to find precisely because nothing said anything.
     *
     * The message is deliberately generic: a thrown action carries only a
     * digest in production, so there is nothing specific to say. Saying
     * something is the point. The cart must never look like it accepted an item
     * it did not.
     */
    const crashed = (rollback: CartView): void => {
      settle(null, rollback)
      onFeedback({ kind: 'error', message: 'הפעולה נכשלה, נסו שוב' })
    }

    return {
      cart: initialCart,
      serverCart: initialCart,
      isAuthenticated: initialAuthenticated,
      mirrorCount: initialCart.item_count,
      // A layout that passes a real `initialCart` has already read the cookie
      // on the server, so that cart IS the server's answer and the mirror has
      // nothing to add. The layouts pass `EMPTY_CART`; the tests pass a cart.
      serverConfirmed: initialCart.item_count > 0,
      pendingOps: 0,
      isPending: false,
      drawerOpen: false,
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),

      addToCart: async (productId, variantId, quantity, productName) => {
        const rollback = begin({ type: 'add', productId, variantId, quantity })
        try {
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
        } catch {
          crashed(rollback)
        }
      },

      updateQuantity: async (productId, variantId, quantity) => {
        const rollback = begin({ type: 'setQty', productId, variantId, quantity })
        try {
          const result = await updateCartItemAction(productId, variantId, quantity)
          if (result.ok) {
            settle(result.cart, rollback)
          } else {
            settle(null, rollback)
            onFeedback({ kind: 'error', message: result.error })
          }
        } catch {
          crashed(rollback)
        }
      },

      removeItem: async (productId, variantId) => {
        const rollback = begin({ type: 'remove', productId, variantId })
        try {
          const result = await removeFromCartAction(productId, variantId)
          if (result.ok) {
            settle(result.cart, rollback)
            onFeedback({ kind: 'removed', message: 'הפריט הוסר מהעגלה' })
          } else {
            settle(null, rollback)
            onFeedback({ kind: 'error', message: result.error })
          }
        } catch {
          crashed(rollback)
        }
      },

      clear: async () => {
        const rollback = get().serverCart
        set((state) => ({
          cart: { ...state.cart, items: [], item_count: 0 },
          pendingOps: state.pendingOps + 1,
          isPending: true,
        }))
        try {
          const result = await clearCartAction()
          if (result.ok) {
            settle(result.cart, rollback)
          } else {
            settle(null, rollback)
            onFeedback({ kind: 'error', message: result.error })
          }
        } catch {
          crashed(rollback)
        }
      },

      setCart: (cart) =>
        set({ cart, serverCart: cart, mirrorCount: cart.item_count, serverConfirmed: true }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    }
  }

  return createStore<CartStoreState>()(
    persist(creator, {
      name: CART_MIRROR_KEY,
      storage: createJSONStorage(() => localStorage),
      // The whole contract of this key, in one line.
      partialize: (state) => ({ mirrorCount: state.mirrorCount }) as CartStoreState,
      // Rehydrating during render would paint a badge the server-rendered HTML
      // does not have, which is a hydration mismatch. `CartProvider` calls
      // `rehydrate()` from an effect instead: still instant, still ahead of the
      // `CartBootstrap` round trip, and after React has matched the trees.
      skipHydration: true,
    }),
  )
}
