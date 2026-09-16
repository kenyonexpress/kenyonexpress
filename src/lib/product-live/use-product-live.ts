'use client'

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
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
    let channel: RealtimeChannel | null = null
    let supabase: ReturnType<typeof createClient> | null = null
    try {
      supabase = createClient()
      channel = supabase
        .channel(productLiveTopic(productId))
        .on('broadcast', { event: PRODUCT_LIVE_EVENT }, (message) => {
          const event = parseProductLiveEvent(message.payload)
          if (!event) return
          setState((prev) => applyProductLiveEvent(prev, event, productId))
        })
        .subscribe()
    } catch {
      // No anon key in this runtime, or no WebSocket. The cached page is the
      // answer, and it was the answer before this hook too.
    }
    return () => {
      if (supabase && channel) void supabase.removeChannel(channel)
    }
  }, [productId])

  return state
}
