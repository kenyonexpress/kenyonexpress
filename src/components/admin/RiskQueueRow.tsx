'use client'

import { type FraudActionState, reviewRiskAssessment } from '@/server/actions/admin/fraud'
import Link from 'next/link'
import { useActionState } from 'react'

const EMPTY: FraudActionState = null

/**
 * One flagged order.
 *
 * The three outcomes are deliberately NOT "approve / reject". Nothing here
 * approves anything - the order is already paid and the goods may already be
 * redeemed. What the operator is recording is what they DID about it, which is
 * why `refunded` means "I went to the refund console and refunded it" rather
 * than "refund it now": this row cannot move money and must not look like it
 * can.
 */
export default function RiskQueueRow({
  orderId,
  score,
  createdAt,
  reasons,
}: {
  orderId: string
  score: number
  createdAt: string
  reasons: string[]
}) {
  const [state, action, pending] = useActionState(reviewRiskAssessment, EMPTY)

  if (state && 'success' in state) {
    return (
      <li className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
        הזמנה {orderId.slice(0, 8)} — {state.success}
      </li>
    )
  }

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/admin/orders/${orderId}`} className="font-semibold underline">
          הזמנה {orderId.slice(0, 8)}
        </Link>
        <span className="text-sm text-gray-500">{new Date(createdAt).toLocaleString('he-IL')}</span>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-900">
          ציון <bdi>{score}</bdi>
        </span>
      </div>

      <ul className="mt-2 list-inside list-disc text-sm text-gray-700">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="order_id" value={orderId} />
        <input
          type="text"
          name="note"
          maxLength={1000}
          placeholder="הערה (רשות)"
          className="min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          name="outcome"
          value="cleared"
          disabled={pending}
          className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          תקין
        </button>
        <button
          type="submit"
          name="outcome"
          value="refunded"
          disabled={pending}
          className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          זוכה
        </button>
        <button
          type="submit"
          name="outcome"
          value="blocked"
          disabled={pending}
          className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          נחסם
        </button>
      </form>

      {state && 'error' in state && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </li>
  )
}
