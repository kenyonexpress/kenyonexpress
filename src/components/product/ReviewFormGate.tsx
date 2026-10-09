'use client'

import { getMyReviewableItem } from '@/server/actions/reviews'
import { useEffect, useState } from 'react'
import ReviewForm from './ReviewForm'

/**
 * Client-side gate for the review form. The product page is cached for every
 * visitor, so "does THIS session hold an unspent review slot" cannot render on
 * the server -- it is asked after paint through a server action, and the
 * INSERT policy re-verifies the answer on submit anyway.
 */
export default function ReviewFormGate({ productId }: { productId: string }) {
  const [orderItemId, setOrderItemId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyReviewableItem(productId).then((item) => {
      if (!cancelled && item) setOrderItemId(item.orderItemId)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (!orderItemId) return null
  return (
    <div className="mb-6">
      <ReviewForm productId={productId} orderItemId={orderItemId} />
    </div>
  )
}
