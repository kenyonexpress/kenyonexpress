'use client'

import { useEffect, useState } from 'react'
import {
  PRODUCT_LIVE_EVENT,
  type ProductLiveState,
  applyProductLiveEvent,
  initialProductLiveState,
  parseProductLiveEvent,
  productLiveTopic,
} from './live-event'

/**
 * Subscribes an open product page to its own broadcast topic.
 *
 * The page renders from an hour-old cache (see `product-detail.ts`) and this
 * hook is how it stops offering a unit that was sold under it. Migration 235
 * broadcasts every stock / price / status change on `product:<id>` with
 * `realtime.send`, chosen over `postgres_changes` because a row-change feed
 * ships the whole `products` row -- margins included -- to whoever listens.
 *
 * THE FAILURE MODE IS SILENCE, AND THAT IS ACCEPTED. A topic nobody broadcasts
 * on (the migration not applied, the Realtime tenant asleep, a network that
 * blocks websockets) connects, reports SUBSCRIBED and delivers nothing; the
 * page then behaves exactly as it did before this hook existed. Nothing here
 * throws, renders an error, or retries in a loop: a product page that works
 * without a socket is the baseline, and this is an improvement on it.
 *
 * `scripts/verify-product-live.mjs` is the end-to-end proof that the path
 * delivers against production; this hook is only the wiring.
 */
export function useProductLive(
  productId: string,
  base: { stock: number | null; price: number; oldPrice: number | null },
): ProductLiveState {
  const [state, setState] = useState<ProductLiveState>(() => initialProductLiveState(base))

  useEffect(() => {
    // The client is imported inside the effect so the product page's first
    // load does not carry Supabase auth, realtime and storage (~60 KB gz) for
    // a socket that only matters after hydration (C183).
    let cancelled = false
    let cleanup: (() => void) | null = null
    void import('@/lib/supabase/client')
      .then(({ createClient }) => {
        if (cancelled) return
        const supabase = createClient()
        const channel = supabase
          .channel(productLiveTopic(productId))
          .on('broadcast', { event: PRODUCT_LIVE_EVENT }, (message) => {
            const event = parseProductLiveEvent(message.payload)
            if (!event) return
            setState((prev) => applyProductLiveEvent(prev, event, productId))
          })
          .subscribe()
        cleanup = () => {
          void supabase.removeChannel(channel)
        }
      })
      .catch(() => {
        // No anon key in this runtime, or no WebSocket. The cached page is the
        // answer, and it was the answer before this hook too.
      })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [productId])

  return state
}
