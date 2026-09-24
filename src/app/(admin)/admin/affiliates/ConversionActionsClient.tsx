'use client'

import {
  type CampaignActionState,
  decideAffiliateConversion,
} from '@/server/actions/admin/affiliate-campaigns'
import { useActionState } from 'react'

const INITIAL: CampaignActionState = null

/**
 * Approve (pays through the same function finalize uses) or reject (with a
 * reason) one conversion that is waiting. Settled rows render nothing.
 */
export default function ConversionActionsClient({
  conversionId,
  status,
}: {
  conversionId: string
  status: string
}) {
  const [state, action, pending] = useActionState(decideAffiliateConversion, INITIAL)
  if (status !== 'pending' && status !== 'flagged') {
    return state && 'success' in state ? (
      <span className="text-xs text-green-600">{state.success}</span>
    ) : null
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={conversionId} />
      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
      >
        אישור וזיכוי
      </button>
      <input
        name="reason"
        placeholder="סיבת דחייה"
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
