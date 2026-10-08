'use client'

import { type SupportStatus, supportStatus, supportStatusLabel } from '@/lib/support-hours'
import { useEffect, useState } from 'react'

/**
 * "Open now" / "closed, opens ..." for the contact page (STEP 52).
 *
 * Computed in the BROWSER, after mount, and never on the server. The page is
 * prerendered, so a server-side answer would be whatever the clock said at
 * build time, frozen; and a value computed on both sides from two clocks is a
 * hydration mismatch waiting for the next minute. Before mount the badge is an
 * empty box of the same height, so nothing shifts when it fills.
 *
 * The clock is read in `Asia/Jerusalem` by `lib/support-hours`, so a visitor
 * in New York sees the Israeli answer, which is the only one that is true.
 */
export default function SupportStatusBadge({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<SupportStatus | null>(null)

  useEffect(() => {
    const tick = () => setStatus(supportStatus(new Date()))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <p
      data-testid="support-status"
      data-open={status ? String(status.open) : undefined}
      aria-live="polite"
      className={`flex min-h-6 items-center gap-2 text-sm font-medium text-heading ${className}`}
    >
      {status && (
        <>
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 rounded-full ${
              status.open ? 'bg-success' : 'bg-heading/40'
            }`}
          />
          <span>{supportStatusLabel(status)}</span>
        </>
      )}
    </p>
  )
}
