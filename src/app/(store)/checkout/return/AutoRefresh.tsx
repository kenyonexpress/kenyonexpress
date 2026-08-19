'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Re-runs the server reconcile every few seconds while the payment settles,
 * and stops after `budgetMs` instead of polling for as long as the tab is open.
 *
 * The stop is not a nicety. `reconcileOrderReturn` answers `pending` from
 * several states that can be permanent - no payment row, a payment with no Low
 * Profile id, an amount mismatch - and NOTHING moves an abandoned order off
 * `pending`: `orders.expires_at` is written at insert and read by no sweeper.
 * Once a Low Profile id exists every pass also calls `verifyLowProfile`, so a
 * tab left open on a payment the shopper walked away from was 1,200 calls an
 * hour to the provider, forever.
 *
 * Two minutes covers a slow webhook without leaving anyone watching a dead
 * spinner. What replaces the spinner is a route out - the pending screen
 * carries no link of its own - plus a manual check, because a shopper who IS
 * still waiting must be able to continue without the loop running unattended.
 */
export default function AutoRefresh({
  intervalMs = 3000,
  budgetMs = 120_000,
}: {
  intervalMs?: number
  budgetMs?: number
}) {
  const router = useRouter()
  /**
   * Also the effect's switch: flipping it back to true tears the interval down
   * and rebuilds it, which is how the manual check gets a fresh budget.
   */
  const [waiting, setWaiting] = useState(true)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!waiting) return
    startedAt.current = Date.now()
    const timer = setInterval(() => {
      // Measured against the clock rather than counted in ticks: a backgrounded
      // tab throttles setInterval, and a counter would keep the loop alive long
      // past two minutes of the shopper's time.
      if (Date.now() - startedAt.current >= budgetMs) {
        clearInterval(timer)
        setWaiting(false)
        return
      }
      router.refresh()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [router, intervalMs, budgetMs, waiting])

  const checkAgain = useCallback(() => {
    // The press is itself a check, so pressing it does not cost another three
    // seconds to find out.
    router.refresh()
    setWaiting(true)
  }, [router])

  if (waiting) return null

  return (
    <div className="checkout-pending__stalled">
      <p className="checkout-success__sub">
        האימות מול חברת הסליקה לוקח יותר מהרגיל. ההזמנה נשמרה, ואם החיוב עבר יישלח אליכם אישור
        במייל.
      </p>
      <p style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button type="button" className="checkout-error__retry" onClick={checkAgain}>
          בדקו שוב
        </button>
        <Link href="/account/orders" style={{ fontWeight: 600 }}>
          ההזמנות שלי
        </Link>
      </p>
    </div>
  )
}
