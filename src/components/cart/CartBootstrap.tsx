'use client'

import { useCartStoreApi } from '@/components/cart/CartProvider'
import { readCartFallback } from '@/lib/cart/local-fallback'
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
 *
 * WHEN THE FETCH FAILS, THE LAST CONFIRMED CART IS SHOWN INSTEAD OF NOTHING.
 *
 * Before this, a shopper opening the site with no network (the PWA makes that
 * a normal thing to do) saw the badge insist on "3" over a cart page that said
 * it was empty: the count survives in the mirror, the lines did not survive
 * anywhere. `lib/cart/local-fallback.ts` keeps the last cart the server
 * confirmed, and a failed bootstrap restores it flagged `fallbackActive`,
 * which every checkout button reads as "refuse" and every cart surface reads
 * as "say the prices are as of the last connection". The next successful
 * answer, here on `online` or from any settled mutation, overwrites it: the
 * server wins on hydrate, which is the rule the fallback exists inside of.
 */
export default function CartBootstrap() {
  const store = useCartStoreApi()

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      let payload: { cart: CartView; isAuthenticated: boolean }
      try {
        const res = await fetch('/api/cart', { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(`cart bootstrap ${res.status}`)
        payload = (await res.json()) as { cart: CartView; isAuthenticated: boolean }
      } catch {
        // Unmount mid-flight is the one failure with nothing to restore into.
        if (controller.signal.aborted) return
        // Network failure or a server error: the locally persisted mirror
        // (rehydrated by CartProvider) keeps the badge, and the line fallback,
        // if there is one, keeps the cart. `restoreFallback` refuses on its own
        // if the server has answered or a write is in flight.
        const fallback = readCartFallback()
        if (fallback) store.getState().restoreFallback(fallback)
        return
      }

      const state = store.getState()
      state.setAuthenticated(payload.isAuthenticated)
      // A mutation can land before this fetch does: the shopper can press
      // add-to-cart on a prerendered shell while the bootstrap request is still
      // in flight. Overwriting then would drop the item they just added and put
      // the pre-add cart back on screen. `pendingOps` is how the store already
      // knows a mutation is outstanding, and a settled mutation's cart is a
      // fresher read than this one, so both cases are skipped. A restored
      // fallback is NOT skipped: `restoreFallback` leaves `serverCart` alone
      // precisely so this check still sees a server that has not answered.
      if (state.pendingOps > 0 || state.serverCart.id !== null) return
      state.setCart(payload.cart)
    }

    void load()

    // Coming back online is the retry. Only while the server has not answered:
    // once it has, the store is current and a mutation refreshes it anyway.
    const onOnline = () => {
      if (store.getState().serverConfirmed) return
      void load()
    }
    window.addEventListener('online', onOnline)

    return () => {
      controller.abort()
      window.removeEventListener('online', onOnline)
    }
  }, [store])

  return null
}
