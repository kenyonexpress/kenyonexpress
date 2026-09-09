'use client'

import { type ReviewableItem, getMyReviewableItem } from '@/server/actions/reviews'
import { useEffect, useState } from 'react'
import ReviewForm from './ReviewForm'

/**
 * Client-side gate for the review form. The product page is cached for every
 * visitor, so "does THIS session hold an unspent review slot" cannot render on
 * the server -- it is asked after paint through a server action, and the
 * INSERT policy re-verifies the answer on submit anyway.
 *
 * The same read reports whether `reviews.title` exists (pending/189), because
 * the form must not offer a field the database would make the action drop.
 */
export default function ReviewFormGate({ productId }: { productId: string }) {
  const [item, setItem] = useState<ReviewableItem | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyReviewableItem(productId).then((found) => {
      if (!cancelled && found) setItem(found)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (!item) return null
  return (
    <div className="mb-6">
      <ReviewForm
        productId={productId}
        orderItemId={item.orderItemId}
        titleSupported={item.titleSupported}
      />
    </div>
  )
}
