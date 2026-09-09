'use client'

import { type FraudActionState, resolveDispute } from '@/server/actions/admin/fraud'
import Link from 'next/link'
import { useActionState } from 'react'

const EMPTY: FraudActionState = null

const KIND: Record<string, string> = {
  chargeback: 'הכחשת עסקה',
  retrieval: 'בקשת מסמכים',
  pre_arbitration: 'טרום בוררות',
  inquiry: 'בירור',
}

const STATUS: Record<string, string> = {
  open: 'פתוח',
  evidence_submitted: 'ראיות הוגשו',
  won: 'זכינו',
  lost: 'הפסדנו',
  accepted: 'קיבלנו את החיוב',
}

/**
 * One dispute, and the deadline that is the whole reason it is a row.
 *
 * The days-left number is rendered from `respond_by` on every load rather than
 * stored: a countdown that was computed when the row was written is wrong by
 * definition the next morning, and this is the field whose being wrong costs
 * the money.
 */
export default function DisputeRow({
  id,
  orderId,
  providerRef,
  kind,
  status,
  amountLabel,
  respondBy,
  resolvedAt,
}: {
  id: string
  orderId: string
  providerRef: string
  kind: string
  status: string
  amountLabel: string
  respondBy: string
  resolvedAt: string | null
}) {
  const [state, action, pending] = useActionState(resolveDispute, EMPTY)

  const daysLeft = Math.ceil((new Date(respondBy).getTime() - Date.now()) / 86_400_000)
  const open = resolvedAt === null
  const overdue = open && daysLeft < 0

  return (
    <li className={`rounded-lg border p-4 ${overdue ? 'border-red-300 bg-red-50' : 'bg-white'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">תיק {providerRef}</span>
        <Link href={`/admin/orders/${orderId}`} className="text-sm underline">
          הזמנה {orderId.slice(0, 8)}
        </Link>
        <span className="text-sm">{KIND[kind] ?? kind}</span>
        <span className="text-sm font-semibold">{amountLabel}</span>
        <span className="text-sm">{STATUS[status] ?? status}</span>
      </div>

      <p className={`mt-1 text-sm ${overdue ? 'font-semibold text-red-800' : 'text-gray-600'}`}>
        {open
          ? overdue
            ? `מועד התשובה עבר לפני ${Math.abs(daysLeft)} ימים.`
            : `נותרו ${daysLeft} ימים להשיב.`
          : `נסגר ב-${new Date(resolvedAt).toLocaleDateString('he-IL')}.`}
      </p>

      <p className="mt-2 flex flex-wrap gap-2 text-sm">
        <a className="underline" href={`/api/admin/disputes/${id}/evidence`} download>
          הורדת תיק ראיות
        </a>
        <a className="underline" href={`/api/admin/disputes/${id}/evidence?format=json`} download>
          (JSON)
        </a>
      </p>

      {open && (
        <form action={action} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            name="status"
            value="evidence_submitted"
            disabled={pending}
            className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            הראיות הוגשו
          </button>
          <button
            type="submit"
            name="status"
            value="won"
            disabled={pending}
            className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            זכינו
          </button>
          <button
            type="submit"
            name="status"
            value="lost"
            disabled={pending}
            className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            הפסדנו
          </button>
          <button
            type="submit"
            name="status"
            value="accepted"
            disabled={pending}
            className="min-h-11 rounded-lg bg-gray-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            מקבלים את החיוב
          </button>
        </form>
      )}

      {state && 'error' in state && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </li>
  )
}
