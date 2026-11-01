'use client'

import { describeCouponExpiry } from '@/lib/commerce/coupon-expiry'
import { useEffect, useState } from 'react'

/**
 * "נותרו 3 ימים למבצע" on a listing card, for an offer in its last week.
 *
 * ONLY A REAL DEADLINE, AND ONLY WHEN IT IS NEAR. The number comes from
 * `products.offer_valid_until` through `describeCouponExpiry`, the same
 * function the product page counts with, so a card and its page cannot
 * disagree. A deadline more than a week out prints nothing: "נותרו 200 ימים"
 * on a card is noise wearing urgency, and an offer that has already closed
 * is the product page's sentence to say, not a badge's.
 *
 * Client-only and empty on the server, for the reason
 * `CouponExpiryCountdown` gives: the listing is cached for hours and a line
 * that depends on the clock has to be read on the visitor's device. The
 * minute timer keeps a tab left open overnight honest.
 */
export default function CardOfferDeadline({ validUntilIso }: { validUntilIso: string }) {
  const [state, setState] = useState<{ label: string; urgency: 'soon' | 'today' } | null>(null)

  useEffect(() => {
    const validUntil = new Date(validUntilIso)
    const tick = () => {
      const expiry = describeCouponExpiry({ validUntil, expiryDays: null })
      const open = validUntil.getTime() > Date.now()
      setState(
        open && expiry.countdownLabel && expiry.urgency !== 'none'
          ? { label: expiry.countdownLabel, urgency: expiry.urgency }
          : null,
      )
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [validUntilIso])

  if (!state) return null
  return (
    <span className="category-card__deadline" data-urgency={state.urgency}>
      {state.label}
    </span>
  )
}
