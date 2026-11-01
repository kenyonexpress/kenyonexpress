'use client'

import {
  type FraudActionState,
  clearFraudFlag,
  flagOrderChargeback,
  resolveFraudReview,
} from '@/server/actions/admin/fraud'
import { useActionState } from 'react'

/**
 * Per-row action state, same rule as the queues page: one shared state would
 * stamp "בוצע" next to every row the moment one succeeded.
 */

const BUTTON = 'rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60'

export function ReviewDecisionButtons({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState<FraudActionState, FormData>(
    resolveFraudReview,
    null,
  )

  if (state?.ok) {
    return <span className="shrink-0 text-xs font-medium text-green-700">טופל</span>
  }

  return (
    <div className="shrink-0">
      <form action={action} className="flex gap-2">
        <input type="hidden" name="item_id" value={itemId} />
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          className={`${BUTTON} border-green-300 text-green-700 hover:bg-green-50`}
        >
          {pending ? 'שומר...' : 'אשר לקוח'}
        </button>
        <button
          type="submit"
          name="decision"
          value="blocked"
          disabled={pending}
          className={`${BUTTON} border-red-300 text-red-700 hover:bg-red-50`}
        >
          {pending ? 'שומר...' : 'חסום'}
        </button>
      </form>
      {state && !state.ok && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </div>
  )
}

export function ClearFlagButton({ flagId }: { flagId: string }) {
  const [state, action, pending] = useActionState<FraudActionState, FormData>(clearFraudFlag, null)

  if (state?.ok) {
    return <span className="shrink-0 text-xs font-medium text-green-700">נוקה</span>
  }

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="flag_id" value={flagId} />
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON} border-gray-300 hover:bg-gray-50`}
      >
        {pending ? 'מנקה...' : 'נקה דגל'}
      </button>
      {state && !state.ok && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  )
}

export function ChargebackForm() {
  const [state, action, pending] = useActionState<FraudActionState, FormData>(
    flagOrderChargeback,
    null,
  )

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        מזהה הזמנה
        <input
          name="order_id"
          required
          dir="ltr"
          placeholder="uuid"
          className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        סיבה
        <input
          name="reason"
          required
          placeholder="chargeback מהסולק, מספר אסמכתה"
          className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON} border-red-300 text-red-700 hover:bg-red-50`}
      >
        {pending ? 'מסמן...' : 'סמן chargeback'}
      </button>
      {state?.ok && <span className="text-xs font-medium text-green-700">סומן</span>}
      {state && !state.ok && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
