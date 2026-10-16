'use client'

import { formatCountdown, secondsUntilJerusalemMidnight } from '@/lib/homepage/below-fold-rules'
import { useEffect, useState } from 'react'

/**
 * "מסתיים בעוד: HH:MM:SS", ticking to midnight in Israel, as Electro's
 * `.deal-countdown-timer` pill.
 *
 * SHAPE (UX08). Measured off refs/electro-home-v7_computed.json at 1440: one
 * brand-yellow pill, 207x36, padding 5px 34px, radius 50px (a full round on a
 * 36px box), 15px/700 in the heading colour, the "Ends in:" label 10px before
 * the figures, and the figures in the body face rather than a monospace one.
 * Before this it was a 14px label beside a separate 4px-radius monospace chip
 * at 16px/900 with 1.6px tracking (logs/ux08/before.json). Live has no
 * countdown anywhere (live-home-sections.test.ts pins its deals grid flat),
 * so the shape is Electro's, as docs/SOURCING-RULES.md allows, and the copy
 * is Hebrew. The two lengths are tokens.css `--spacing-deal-countdown*`; the
 * size is `--text-body-lg`, already 15px.
 *
 * Client-only, and blank-but-shaped on the server: the home page is
 * prerendered and cached for an hour, so any figure that depends on the clock
 * has to be read on the visitor's device or it is stale for most of that hour.
 * The first paint is `--:--:--` in the same box (no hydration mismatch, no
 * layout shift), the first effect fills it, and a one-second timer keeps it
 * honest. Same pattern as `storefront/CouponExpiryCountdown`. `tabular-nums`
 * keeps the pill from breathing as the digits change.
 */
export default function DealCountdown() {
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setLeft(secondsUntilJerusalemMidnight(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <p
      data-deal-countdown
      className="m-0 inline-flex min-h-deal-countdown max-w-full items-center gap-2 rounded-full bg-brand-primary px-deal-countdown-pad py-1 text-body-lg font-bold text-heading"
    >
      <span>מסתיים בעוד:</span>
      <output dir="ltr" aria-live="off" className="tabular-nums">
        {left === null ? '--:--:--' : formatCountdown(left)}
      </output>
    </p>
  )
}
