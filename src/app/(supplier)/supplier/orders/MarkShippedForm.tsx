'use client'

import { markSupplierItemShipped } from '@/server/actions/supplier/shipping'
import { useState, useTransition } from 'react'

/**
 * The supplier's own "I have sent this" button.
 *
 * Rendered only on a PHYSICAL line that is still `pending`. A coupon has
 * nothing to ship, and a line already shipped or delivered has nothing to
 * declare -- offering the button there would produce a refusal from
 * `planTransition` that the page could have avoided asking for.
 *
 * BOTH FIELDS ARE REQUIRED, in the markup and again in the action. The whole
 * reason this button exists is that a customer was told "נשלח" and given no
 * number; a supplier allowed to declare a shipment without saying who has it
 * would recreate exactly that. `required` here is the courtesy, the check in
 * the action is the rule.
 *
 * Collapsed behind a summary for the same reason the waitlist is: an orders
 * page with a two-field form open on every pending line is a wall.
 */
export default function MarkShippedForm({ orderItemId }: { orderItemId: string }) {
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return <p className="mt-2 text-xs font-semibold text-emerald-700">נשלח, תודה.</p>
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-heading">סימון כנשלח</summary>

      <div className="mt-2 flex flex-wrap items-start gap-2">
        <input
          aria-label="חברת שליחויות"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="חברת שליחויות"
          required
          className="h-11 min-w-0 flex-1 rounded-lg border border-black/15 px-2 text-sm"
        />
        <input
          aria-label="מספר מעקב"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="מספר מעקב"
          required
          // The number is Latin and digits; the form around it stays RTL.
          dir="ltr"
          className="h-11 min-w-0 flex-1 rounded-lg border border-black/15 px-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || !carrier.trim() || !tracking.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await markSupplierItemShipped(orderItemId, carrier, tracking)
              if (result.ok) setDone(true)
              else setError(result.error ?? 'העדכון נכשל.')
            })
          }
          className="h-11 rounded-lg bg-brand-primary px-3 text-sm font-bold text-brand-dark disabled:opacity-60"
        >
          {pending ? 'שומר…' : 'סימון כנשלח'}
        </button>

        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
