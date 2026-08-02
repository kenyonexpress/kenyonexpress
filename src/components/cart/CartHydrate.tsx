'use client'

import { useCartStoreApi } from '@/components/cart/CartProvider'
import type { CartView } from '@/lib/cart/types'
import { useEffect } from 'react'

/**
 * Writes the server's cart into the store that the chrome already mounted.
 *
 * Renders nothing. It exists because the cart is read from a cookie and the
 * layout above it must not await one - see `CartProvider`. `<CartBootstrap>`
 * resolves in a streamed hole and hands the result here.
 *
 * `setCart` moves the rollback target as well as the visible cart, so a failed
 * mutation after this point rolls back to the server's cart and not to the
 * empty one the store started with.
 */
export default function CartHydrate({
  cart,
  isAuthenticated,
}: {
  cart: CartView
  isAuthenticated: boolean
}) {
  const store = useCartStoreApi()

  useEffect(() => {
    const state = store.getState()
    state.setAuthenticated(isAuthenticated)
    // A mutation can land before this hole does: the shopper can press
    // add-to-cart on a prerendered shell while the bootstrap request is still
    // in flight. Overwriting then would drop the item they just added and put
    // the pre-add cart back on screen. `pendingOps` is how the store already
    // knows a mutation is outstanding, and a settled mutation's cart is a
    // fresher read than this one, so both cases are skipped.
    if (state.pendingOps > 0 || state.serverCart.id !== null) return
    state.setCart(cart)
  }, [cart, isAuthenticated, store])

  return null
}
