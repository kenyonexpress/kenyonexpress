'use client'

import {
  type CouponCountdown as Shape,
  describeCouponCountdown,
} from '@/lib/homepage/coupon-countdown'
import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * "מסתיים בעוד 3 ימים 04:12:33", ticking to `coupon_deals.valid_until` (UX10).
 *
 * Client-only, and blank-but-shaped on the server, for the reason
 * `home/DealCountdown` gives: the home page is prerendered and cached, so a
 * figure that depends on the clock has to be read on the visitor's device.
 * The first paint is the label with `--:--:--` in the same pill (no hydration
 * mismatch), the first effect fills it, a one-second timer keeps it honest,
 * and the timer stops itself once the deadline has passed.
 *
 * The day word sits in the label span and the clock in an LTR `<output>`:
 * "3 ימים" is Hebrew and reads right to left with the sentence, the clock is a
 * clock. `data-urgency` carries the tone (`today` under a day, `soon` under
 * four, `ended` past it) for the stylesheet; the words carry it for everyone
 * else.
 */
export default function CouponCountdown({ validUntilIso }: { validUntilIso: string }) {
  const [state, setState] = useState<Shape | null>(null)

  useEffect(() => {
    const until = new Date(validUntilIso)
    if (Number.isNaN(until.getTime())) return
    const tick = () => {
      const next = describeCouponCountdown(until, new Date())
      setState(next)
      if (next.ended) clearInterval(id)
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [validUntilIso])

  if (state?.ended) {
    return (
      <p data-coupon-countdown data-urgency="ended" className="coupon-ticket__countdown">
        <Clock size={14} aria-hidden="true" />
        <span>המבצע הסתיים</span>
      </p>
    )
  }

  return (
    <p
      data-coupon-countdown
      data-urgency={state?.urgency ?? 'none'}
      className="coupon-ticket__countdown"
    >
      <Clock size={14} aria-hidden="true" />
      <span>{state?.daysLabel ? `מסתיים בעוד ${state.daysLabel}` : 'מסתיים בעוד'}</span>
      <output dir="ltr" aria-live="off" className="tabular-nums">
        {state ? state.clock : '--:--:--'}
      </output>
    </p>
  )
}
