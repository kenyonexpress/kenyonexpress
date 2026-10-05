'use client'

import {
  type PayoutActionState,
  decideAffiliatePayout,
} from '@/server/actions/admin/affiliate-payouts'
import { useActionState } from 'react'

const INITIAL: PayoutActionState = null

/**
 * Mark one payout request paid (debits the affiliate's wallet first, see the
 * action) or reject it with a note. Settled rows render nothing.
 */
export default function AffiliatePayoutActionsClient({
  requestId,
  status,
}: {
  requestId: string
  status: string
}) {
  const [state, action, pending] = useActionState(decideAffiliatePayout, INITIAL)
  if (status !== 'pending') {
    return state && 'success' in state ? (
      <span className="text-xs text-green-600">{state.success}</span>
    ) : null
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={requestId} />
      <button
        type="submit"
        name="decision"
        value="paid"
        disabled={pending}
        className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
      >
        שולם וחויב מהארנק
      </button>
      <input
        name="note"
        placeholder="הערה / סיבת דחייה"
        maxLength={300}
        className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
      >
        דחייה
      </button>
      {state && 'error' in state && <span className="text-xs text-red-600">{state.error}</span>}
      {state && 'success' in state && (
        <span className="text-xs text-green-600">{state.success}</span>
      )}
    </form>
  )
}
