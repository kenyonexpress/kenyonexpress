'use client'

import { formatCountdown } from '@/lib/homepage/below-fold-rules'
import { useEffect, useState } from 'react'

/**
 * "<label> HH:MM:SS", ticking down to a fixed moment on the visitor's device.
 *
 * Same shape as `home/DealCountdown`: blank-but-shaped on the server (the
 * page's static shell carries no clock), filled by the first effect, kept
 * honest by a one-second timer. At zero it says the campaign has ended
 * rather than counting negative; the page's schedule window is what
 * actually closes the page, this is only the visible clock.
 */
export default function LandingCountdown({ label, endsAt }: { label: string; endsAt: string }) {
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    const end = Date.parse(endsAt)
    if (Number.isNaN(end)) return
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  if (left === 0) {
    return <p className="m-0 text-sm font-semibold text-heading">המבצע הסתיים</p>
  }

  return (
    <p className="m-0 flex items-center gap-2 text-sm text-heading">
      <span>{label}</span>
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
