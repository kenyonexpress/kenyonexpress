'use client'

import { useCartStoreApi } from '@/components/cart/CartProvider'
import { readCartFallback } from '@/lib/cart/local-fallback'
import {
  CART_SYNCED_MESSAGE,
  CART_SYNC_FAILED_MESSAGE,
  type CartSyncRejected,
  flushCartSyncQueue,
  readCartSyncQueue,
  requestBackgroundCartSync,
} from '@/lib/cart/sync-queue'
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
 *
 * AND THE WRITES MADE WHILE OFFLINE ARE REPLAYED FROM HERE TOO.
 *
 * `lib/cart/sync-queue.ts` keeps the line quantities a shopper set with no
 * network. This component is the page half of the replay: on mount it reads
 * the queue back into the store (so the checkout guard survives a reload),
 * and on mount and on every `online` it asks the browser for a Background
 * Sync through the worker, falling back to posting the queue itself where
 * the browser has none (every WebKit browser, so every iPhone). The worker's
 * answer arrives as a `message` on `navigator.serviceWorker` and lands
 * through the same `applySync` the page path uses. A bootstrap read never
 * paints over a pending queue: the sync reply is the fresher cart.
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
      // A queued line is skipped too: the replay's reply holds those lines,
      // this read does not, and painting it would remove them from the screen
      // for the second between the two.
      if (state.pendingOps > 0 || state.serverCart.id !== null || state.queuedLines > 0) return
      state.setCart(payload.cart)
    }

    /**
     * Gets the queue replayed, by whichever side can. The worker where the
     * browser grants Background Sync (registering while online fires the
     * `sync` event at once), the page otherwise. Never both: a replay is
     * idempotent but it still spends the shopper's write budget.
     */
    const replay = async () => {
      if (await requestBackgroundCartSync()) return
      const outcome = await flushCartSyncQueue()
      if (controller.signal.aborted) return
      if (outcome.kind === 'synced') {
        store.getState().applySync(outcome.result.cart, outcome.result.rejected)
      } else if (outcome.kind === 'refused') {
        store.getState().syncRefused()
        void load()
      }
    }

    const start = async () => {
      const queued = await readCartSyncQueue()
      if (controller.signal.aborted) return
      if (queued.length > 0) {
        store.getState().seedQueued(queued)
        void replay()
      }
      void load()
    }

    void start()

    // Coming back online is the retry: the queue first, then the bootstrap
    // read, and the latter only while the server has not answered.
    const onOnline = () => {
      void replay().then(() => {
        if (store.getState().serverConfirmed) return
        void load()
      })
    }
    window.addEventListener('online', onOnline)

    // The worker's replay reports here.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: typeof CART_SYNCED_MESSAGE; cart: CartView; rejected?: CartSyncRejected[] }
        | { type: typeof CART_SYNC_FAILED_MESSAGE; status: number }
        | null
      if (!data || typeof data !== 'object') return
      if (data.type === CART_SYNCED_MESSAGE && data.cart) {
        store.getState().applySync(data.cart, data.rejected ?? [])
      } else if (data.type === CART_SYNC_FAILED_MESSAGE) {
        store.getState().syncRefused()
        void load()
      }
    }
    const worker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
    worker?.addEventListener('message', onMessage)

    return () => {
      controller.abort()
      window.removeEventListener('online', onOnline)
      worker?.removeEventListener('message', onMessage)
    }
  }, [store])

  return null
}
