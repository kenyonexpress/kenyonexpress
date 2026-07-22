'use client'

import { type OrderActionState, cancelPendingOrder } from '@/server/actions/admin/orders'
import { useActionState } from 'react'

interface Props {
  orderId: string
  currentStatus: string
}

const INITIAL: OrderActionState = null

// F2: the only manual transition is pending -> cancelled (with reason).
// Every other status is owned by the payment/fulfillment flow.
export default function OrderStatusClient({ orderId, currentStatus }: Props) {
  const [state, action, pending] = useActionState(cancelPendingOrder, INITIAL)

  if (currentStatus !== 'pending') {
    return (
      <div className="max-w-sm space-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-800">סטטוס הזמנה</h3>
        <p className="text-sm text-black/60">
          הסטטוס מנוהל אוטומטית על ידי תהליך התשלום והאספקה. החזר כספי להזמנה ששולמה מתבצע דרך מסלול
          ההחזרים.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold text-gray-800">ביטול הזמנה ממתינה</h3>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={orderId} />
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          placeholder="סיבת הביטול (חובה)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {state && 'error' in state && <p className="text-xs text-red-600">{state.error}</p>}
        {state && 'success' in state && <p className="text-xs text-green-600">{state.success}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? 'מבטל...' : 'ביטול הזמנה'}
        </button>
      </form>
    </div>
  )
}
