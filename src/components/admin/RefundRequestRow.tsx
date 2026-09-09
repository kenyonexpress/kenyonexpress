'use client'

import { type FraudActionState, decideRefundRequestAction } from '@/server/actions/admin/fraud'
import Link from 'next/link'
import { useActionState } from 'react'

const EMPTY: FraudActionState = null

const REASONS: Record<string, string> = {
  not_received: 'לא קיבל את ההזמנה',
  not_as_described: 'המוצר אינו כפי שתואר',
  defective: 'המוצר פגום',
  duplicate_charge: 'חויב פעמיים',
  changed_mind: 'התחרט',
  other: 'סיבה אחרת',
}

/**
 * One refund request awaiting a decision.
 *
 * THE NOTE IS MANDATORY IN BOTH DIRECTIONS, including on an approval. A refusal
 * with no reason is what the customer's next two attempts are made of, and this
 * order only has three; an approval with no reason is a refund nobody can
 * account for six months later. The action refuses a note shorter than three
 * characters, so this is the form telling the truth about that rather than
 * discovering it.
 */
export default function RefundRequestRow({
  id,
  orderId,
  reasonCode,
  reasonText,
  createdAt,
}: {
  id: string
  orderId: string
  reasonCode: string
  reasonText: string
  createdAt: string
}) {
  const [state, action, pending] = useActionState(decideRefundRequestAction, EMPTY)

  if (state && 'success' in state) {
    return (
      <li className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">{state.success}</li>
    )
  }

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/admin/orders/${orderId}`} className="font-semibold underline">
          הזמנה {orderId.slice(0, 8)}
        </Link>
        <span className="text-sm font-semibold">{REASONS[reasonCode] ?? reasonCode}</span>
        <span className="text-sm text-gray-500">{new Date(createdAt).toLocaleString('he-IL')}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{reasonText}</p>

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          type="text"
          name="note"
          required
          minLength={3}
          maxLength={1000}
          placeholder="נימוק ההחלטה (חובה)"
          className="min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          לאשר
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          לדחות
        </button>
      </form>

      <p className="mt-2 text-xs text-gray-500">
        אישור כאן אינו מזכה. הזיכוי עצמו נעשה בקונסולת הזיכויים, ורק שם נוגעים בכסף.
      </p>

      {state && 'error' in state && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </li>
  )
}
