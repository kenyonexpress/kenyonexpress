'use client'

import { useEffect, useState } from 'react'

/**
 * Hook to subscribe to realtime updates for product purchase count.
 * Listens to order_items inserts for the given product and updates the count.
 */
export function useProductPurchaseCount(productId: string, initialCount: number) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    // The Supabase client (auth, realtime, storage: ~60 KB gz) is imported
    // here, not at module scope, so the product page's first load does not
    // carry it for a counter that only changes after hydration (C183).
    let cancelled = false
    let cleanup: (() => void) | null = null
    void import('@/lib/supabase/client').then(({ createClient }) => {
      if (cancelled) return
      const supabase = createClient()
      // Subscribe to order_items inserts for this product
      const channel = supabase
        .channel(`product-purchases:${productId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'order_items',
            filter: `product_id=eq.${productId}`,
          },
          () => {
            // Increment count when a new purchase is made
            setCount((prev) => prev + 1)
          },
        )
        .subscribe()
      cleanup = () => {
        void supabase.removeChannel(channel)
      }
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [productId])

  return count
}
