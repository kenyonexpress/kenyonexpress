'use client'

import {
  type ValidityParts,
  validityLabel,
  validityRemaining,
  validityTickMs,
} from '@/lib/vouchers/countdown'
import { useEffect, useState } from 'react'

/**
 * A live "time left to redeem" line for one coupon.
 *
 * FIRST PAINT IS THE SERVER'S SENTENCE, NOT THE DIGITS. The caller passes the
 * formatted deadline it already prints ("בתוקף עד 12 באוקטובר") as `fallback`,
 * and that is what the static markup carries. A remaining time computed on the
 * server is stale by the time the browser reads it, so rendering it would be a
 * hydration mismatch by construction; the digits replace the sentence on the
 * first tick, on one line, so nothing moves.
 *
 * THE TICK SLOWS DOWN WHEN IT CAN. A customer holding this up at a till in the
 * last hour sees seconds; one who opens it a week ahead sees the minute roll
 * over, which is all that changes. `data-state` tells a test (and a stylesheet)
 * which of the three it is looking at.
 */
export default function ValidityCountdown({
  expiresAt,
  fallback,
  className,
}: {
  expiresAt: string
  /** Server-rendered text shown until the browser has read its own clock. */
  fallback: string
  className?: string
}) {
  const [parts, setParts] = useState<ValidityParts | null | undefined>(undefined)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const next = validityRemaining(expiresAt, Date.now())
      setParts(next)
      if (next !== null) timer = setTimeout(tick, validityTickMs(next))
    }
    tick()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [expiresAt])

  const ticking = parts !== undefined
  const state = !ticking ? 'pending' : parts === null ? 'expired' : 'live'

  return (
    <span
      className={className}
      data-testid="validity-countdown"
      data-state={state}
      // The deadline is the one fact both paints agree on; a test or a reader
      // of the DOM can check the digits against it.
      data-expires-at={expiresAt}
      suppressHydrationWarning
    >
      {ticking ? validityLabel(parts ?? null) : fallback}
    </span>
  )
}
