'use client'

import { requestOrderRefund } from '@/server/actions/payments/request-refund'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The customer's cancel button. It files the notice and nothing else: the
 * decision, the fee and the destination are the server's, and no money moves
 * from this click (see request-refund.ts).
 */
export default function CancelOrderForm({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!confirmed || pending) return
    setError(null)
    startTransition(async () => {
      const outcome = await requestOrderRefund({
        orderId,
        ground: 'distance_sale_14d',
        reasonHe: reason.trim() || undefined,
      })
      if (outcome.ok) {
        router.push(`/account/orders/${orderId}/cancel/done?r=${outcome.refundId}`)
      } else {
        setError(outcome.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block">
        <span className="account-row__meta">סיבת הביטול (לא חובה)</span>
        <textarea
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded-md border border-border p-2"
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1"
        />
        <span>קראתי את תנאי הביטול ואני מבקש לבטל את ההזמנה.</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="account-btn"
        disabled={!confirmed || pending}
        aria-label="ביטול ההזמנה"
      >
        {pending ? 'שולח...' : 'ביטול ההזמנה'}
      </button>
    </form>
  )
}
