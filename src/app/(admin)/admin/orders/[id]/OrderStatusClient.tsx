'use client'

import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import type { OrderStatus } from '@/lib/checkout/state-machine'
import {
  type OrderActionState,
  cancelPendingOrder,
  overrideOrderStatus,
} from '@/server/actions/admin/orders'
import { useActionState } from 'react'

interface Props {
  orderId: string
  currentStatus: string
  /**
   * The states the override policy lets an admin assert from the current one
   * (adminOverridableTargets, computed by the server page). Empty means every
   * move from here belongs to the payment/refund flow.
   */
  overridableTargets: OrderStatus[]
}

const INITIAL: OrderActionState = null

// Manual moves follow the override policy in order-transitions.ts: the
// fulfilment lane (paid -> partially_fulfilled -> fulfilled) and
// pending -> cancelled. Money states stay with the payment/refund flow.
export default function OrderStatusClient({ orderId, currentStatus, overridableTargets }: Props) {
  const [state, action, pending] = useActionState(cancelPendingOrder, INITIAL)
  const [overrideState, overrideAction, overridePending] = useActionState(
    overrideOrderStatus,
    INITIAL,
  )

  if (currentStatus === 'pending') {
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

  if (overridableTargets.length === 0) {
    return (
      <div className="max-w-sm space-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-800">סטטוס הזמנה</h3>
        <p className="text-sm text-black/60">
          אין מעבר ידני מהסטטוס הנוכחי. תשלום והחזר כספי מנוהלים על ידי מסלולי התשלום וההחזרים בלבד.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold text-gray-800">עדכון סטטוס ידני</h3>
      <p className="text-xs text-gray-500">
        קידום אספקה בלבד. תשלום והחזר עוברים דרך מסלולי הכסף, והמעבר נרשם ביומן הביקורת עם הסיבה.
      </p>
      <form action={overrideAction} className="space-y-3">
        <input type="hidden" name="id" value={orderId} />
        <select
          name="to"
          required
          defaultValue=""
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="" disabled>
            סטטוס יעד
          </option>
          {overridableTargets.map((target) => (
            <option key={target} value={target}>
              {ORDER_STATUS_LABELS[target]}
            </option>
          ))}
        </select>
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          placeholder="סיבת השינוי (חובה)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {overrideState && 'error' in overrideState && (
          <p className="text-xs text-red-600">{overrideState.error}</p>
        )}
        {overrideState && 'success' in overrideState && (
          <p className="text-xs text-green-600">{overrideState.success}</p>
        )}
        <button
          type="submit"
          disabled={overridePending}
          className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
        >
          {overridePending ? 'מעדכן...' : 'עדכון סטטוס'}
        </button>
      </form>
    </div>
  )
}
