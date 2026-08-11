'use client'

import { useCartStoreApi } from '@/components/cart/CartProvider'
import type { CartView } from '@/lib/cart/types'
import { useEffect } from 'react'

/**
 * Fills the cart store from `/api/cart`, one fetch after hydration.
 *
 * This was a server component in a `<Suspense>` hole doing the two cookie reads
 * itself. The hole kept the shell static, but a response with a hole in it is
 * postponed (`x-nextjs-postponed`) and served `Cache-Control: no-store` — the
 * storefront could prerender and still could not be cached anywhere. Moving the
 * read to a client fetch closes the hole: the routes are fully static, and the
 * price is that the cart badge appears after hydration instead of streaming in.
 * That trade is deliberate; putting an `await` back in a layout or rendering
 * this on the server silently undoes it, and nothing fails to warn you.
 *
 * `setCart` moves the rollback target as well as the visible cart, so a failed
 * mutation after this point rolls back to the server's cart and not to the
 * empty one the store started with.
 */
export default function CartBootstrap() {
  const store = useCartStoreApi()

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      let payload: { cart: CartView; isAuthenticated: boolean }
      try {
        const res = await fetch('/api/cart', { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) return
        payload = (await res.json()) as { cart: CartView; isAuthenticated: boolean }
      } catch {
        // Network failure or unmount mid-flight: the locally persisted mirror
        // (rehydrated by CartProvider) stays on screen, mutations still work.
        return
      }

      const state = store.getState()
      state.setAuthenticated(payload.isAuthenticated)
      // A mutation can land before this fetch does: the shopper can press
      // add-to-cart on a prerendered shell while the bootstrap request is still
      // in flight. Overwriting then would drop the item they just added and put
      // the pre-add cart back on screen. `pendingOps` is how the store already
      // knows a mutation is outstanding, and a settled mutation's cart is a
      // fresher read than this one, so both cases are skipped.
      if (state.pendingOps > 0 || state.serverCart.id !== null) return
      state.setCart(payload.cart)
    })()

    return () => controller.abort()
  }, [store])

  return null
}
