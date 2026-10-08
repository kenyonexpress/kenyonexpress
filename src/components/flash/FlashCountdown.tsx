'use client'

import { formatCountdown } from '@/lib/homepage/below-fold-rules'
import { useEffect, useState } from 'react'

/**
 * The flash sale's clock (STEP 61): "מתחיל בעוד HH:MM:SS" before the window,
 * "נגמר בעוד HH:MM:SS" inside it, "המבצע הסתיים" after.
 *
 * Same shape as `home/DealCountdown` and `landing/LandingCountdown`: blank
 * but shaped on the server (the banner is in a cached shell that carries no
 * clock), filled by the first effect, kept honest by a one-second timer. The
 * two moments come in as ISO strings and are parsed on the device, so a
 * cached page is never wrong about the time.
 *
 * `onPhaseChange` lets the sale page react when the clock crosses a moment
 * (the claim button appears at the start, the waiting room closes at the
 * end) without a second timer.
 */
export type CountdownPhase = 'upcoming' | 'live' | 'ended'

export function phaseAt(startsAt: string, endsAt: string, nowMs: number): CountdownPhase {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  if (Number.isNaN(start) || Number.isNaN(end) || nowMs >= end) return 'ended'
  if (nowMs < start) return 'upcoming'
  return 'live'
}

export default function FlashCountdown({
  startsAt,
  endsAt,
  onPhaseChange,
  className = '',
}: {
  startsAt: string
  endsAt: string
  onPhaseChange?: (phase: CountdownPhase) => void
  className?: string
}) {
  const [state, setState] = useState<{ phase: CountdownPhase; left: number } | null>(null)

  useEffect(() => {
    let lastPhase: CountdownPhase | null = null
    const tick = () => {
      const now = Date.now()
      const phase = phaseAt(startsAt, endsAt, now)
      const target = phase === 'upcoming' ? Date.parse(startsAt) : Date.parse(endsAt)
      const left = Math.max(0, Math.floor((target - now) / 1000))
      setState({ phase, left })
      if (phase !== lastPhase) {
        lastPhase = phase
        onPhaseChange?.(phase)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startsAt, endsAt, onPhaseChange])

  if (state?.phase === 'ended') {
    return (
      <p className={`m-0 text-sm font-semibold text-heading ${className}`} data-phase="ended">
        המבצע הסתיים
      </p>
    )
  }

  const label = state?.phase === 'upcoming' ? 'מתחיל בעוד' : 'נגמר בעוד'
  return (
    <p
      className={`m-0 flex items-center gap-2 text-sm text-heading ${className}`}
      data-phase={state?.phase ?? 'pending'}
    >
      <span>{label}</span>
      <output
        dir="ltr"
        aria-live="off"
        className="rounded bg-brand-secondary px-3 py-1 font-mono text-base font-black tabular-nums tracking-widest text-heading"
      >
        {state === null ? '--:--:--' : formatCountdown(state.left)}
      </output>
    </p>
  )
}
