'use client'

import { type CouponExpiry, describeCouponExpiry } from '@/lib/commerce/coupon-expiry'
import { useEffect, useState } from 'react'

/**
 * "נותרו 3 ימים למבצע", ticking.
 *
 * Client-only, and empty on the server. The product page is prerendered and
 * cached for an hour, so any line that depends on the clock has to be read
 * on the visitor's device or it is wrong for most of the hour. The first
 * paint is null (no hydration mismatch), the first effect fills it, and a
 * minute timer keeps it honest for a tab left open overnight.
 */
export default function CouponExpiryCountdown({
  validUntilIso,
}: {
  validUntilIso: string
}) {
  const [expiry, setExpiry] = useState<CouponExpiry | null>(null)

  useEffect(() => {
    const validUntil = new Date(validUntilIso)
    const tick = () => setExpiry(describeCouponExpiry({ validUntil, expiryDays: null }))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [validUntilIso])

  if (!expiry?.countdownLabel) return null
  return (
    <output
      className="pdp-coupon-qr__countdown"
      data-urgency={expiry.urgency}
      aria-live="polite"
      dir="rtl"
    >
      {expiry.countdownLabel}
    </output>
  )
}
