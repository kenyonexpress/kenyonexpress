'use client'

import { type OrderActionState, updateOrderStatus } from '@/server/actions/admin/orders'
import { useActionState } from 'react'

interface Props {
  orderId: string
  currentStatus: string
}

const INITIAL: OrderActionState = null

const STATUS_OPTIONS = [
  { value: 'pending', label: 'ממתין' },
  { value: 'paid', label: 'שולם' },
  { value: 'processing', label: 'בטיפול' },
  { value: 'shipped', label: 'נשלח' },
  { value: 'delivered', label: 'נמסר' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'refunded', label: 'הוחזר' },
]

export default function OrderStatusClient({ orderId, currentStatus }: Props) {
  const [state, action, pending] = useActionState(updateOrderStatus, INITIAL)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 max-w-sm">
      <h3 className="font-semibold text-gray-800">עדכון סטטוס</h3>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={orderId} />
        <select
          name="status"
          defaultValue={currentStatus}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {state && 'error' in state && <p className="text-xs text-red-600">{state.error}</p>}
        {state && 'success' in state && <p className="text-xs text-green-600">{state.success}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand hover:bg-[#fedd26] disabled:opacity-60 text-brand-dark text-sm font-semibold rounded-lg py-2 transition-colors"
        >
          {pending ? 'שומר...' : 'עדכון סטטוס'}
        </button>
      </form>
    </div>
  )
}
