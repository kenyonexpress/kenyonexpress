'use client'

import { formatCountdown, secondsUntilJerusalemMidnight } from '@/lib/homepage/below-fold-rules'
import { useEffect, useState } from 'react'

/**
 * "המבצע מתחדש בעוד HH:MM:SS", ticking to midnight in Israel.
 *
 * Client-only, and blank-but-shaped on the server: the home page is
 * prerendered and cached for an hour, so any figure that depends on the clock
 * has to be read on the visitor's device or it is stale for most of that hour.
 * The first paint is `--:--:--` in the same box (no hydration mismatch, no
 * layout shift), the first effect fills it, and a one-second timer keeps it
 * honest. Same pattern as `storefront/CouponExpiryCountdown`.
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
    <p className="m-0 flex items-center gap-2 text-sm text-heading">
      <span>המבצע מתחדש בעוד</span>
      <output
        dir="ltr"
        aria-live="off"
        className="rounded bg-brand-secondary px-3 py-1 font-mono text-base font-black tabular-nums tracking-widest text-heading"
      >
        {left === null ? '--:--:--' : formatCountdown(left)}
      </output>
    </p>
  )
}
