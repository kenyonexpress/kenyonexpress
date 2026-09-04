'use client'

import { type Reconciled, VERDICT_LABELS } from '@/lib/admin/payment-reconciliation'
import { shekelsFromIls } from '@/lib/money-format'
import { retryFinalizePayment } from '@/server/actions/admin/payments'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  rows: Reconciled[]
  strandedIls: number
}

/**
 * The rows where the money and the orders disagree.
 *
 * Only `unfinalized` offers a button, because re-running finalize is the repair
 * for exactly that shape and a no-op or the wrong move for every other. The
 * action re-derives the verdict server-side from fresh rows, so a stale page
 * cannot drive a finalize the classifier would refuse.
 */
export default function ReconcileClient({ rows, strandedIls }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  function retry(paymentId: string) {
    setBusy(paymentId)
    setMessage(null)
    startTransition(async () => {
      const result = await retryFinalizePayment(paymentId)
      setBusy(null)
      if (result.ok) {
        setMessage({
          id: paymentId,
          text: result.replay ? 'ההזמנה כבר הייתה סגורה' : 'ההזמנה נסגרה',
          ok: true,
        })
        router.refresh()
      } else {
        setMessage({ id: paymentId, text: result.error, ok: false })
      }
    })
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-green-800">
        <CheckCircle2 size={16} />
        אין פערים בין תשלומים להזמנות.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {strandedIls > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {shekelsFromIls(strandedIls)} נגבו מלקוחות בהזמנות שלא נסגרו. כל שורה כזאת היא לקוח
            ששילם ולא קיבל.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-start font-medium">הזמנה</th>
              <th className="px-4 py-2.5 text-start font-medium">מצב</th>
              <th className="px-4 py-2.5 text-start font-medium">סכום</th>
              <th className="px-4 py-2.5 text-start font-medium">נגבה בתאריך</th>
              <th className="px-4 py-2.5 text-start font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.paymentId ?? row.orderId} className="align-top">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${row.orderId}`}
                    className="font-mono text-xs text-brand hover:underline"
                    dir="ltr"
                  >
                    {row.orderId.slice(0, 8)}
                  </Link>
                  {row.transactionId && (
                    <div className="text-xs text-gray-400" dir="ltr">
                      {row.transactionId}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      row.verdict === 'unfinalized'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {VERDICT_LABELS[row.verdict]}
                  </span>
                  <div className="mt-1 max-w-md text-xs text-gray-500">{row.message}</div>
                </td>
                <td className="px-4 py-3 text-gray-700" dir="ltr">
                  {row.amountIls === null ? '—' : shekelsFromIls(row.amountIls)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {row.succeededAt ? new Date(row.succeededAt).toLocaleString('he-IL') : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.retryable && row.paymentId ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => retry(row.paymentId as string)}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
                    >
                      {busy === row.paymentId ? 'מריץ...' : 'הרצת סגירה מחדש'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">בדיקה ידנית</span>
                  )}
                  {message?.id === row.paymentId && (
                    <div
                      className={`mt-1 text-xs ${message.ok ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {message.text}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        הרצת הסגירה מחדש היא אידמפוטנטית: אם ההזמנה כבר נסגרה בינתיים היא לא תנפיק שוברים פעמיים ולא
        תזכה ספק פעמיים.
      </p>
    </div>
  )
}
