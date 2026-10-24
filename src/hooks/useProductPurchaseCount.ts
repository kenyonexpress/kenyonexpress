'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

/**
 * Hook to subscribe to realtime updates for product purchase count.
 * Listens to order_items inserts for the given product and updates the count.
 */
export function useProductPurchaseCount(productId: string, initialCount: number) {
  const [count, setCount] = useState(initialCount)
  const supabase = createClient()

  useEffect(() => {
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

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [productId, supabase])

  return count
}
