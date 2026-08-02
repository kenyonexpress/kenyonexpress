'use client'

import { type AffiliateActionState, decideAffiliate } from '@/server/actions/admin/affiliates'
import type { AffiliateStatus } from '@/types/database'
import { useActionState } from 'react'

const INITIAL: AffiliateActionState = null

export default function AffiliateActionsClient({
  affiliateId,
  status,
}: {
  affiliateId: string
  status: AffiliateStatus
}) {
  const [state, action, pending] = useActionState(decideAffiliate, INITIAL)

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={affiliateId} />
      {status !== 'approved' && (
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          אישור
        </button>
      )}
      {status === 'pending_review' && (
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          דחייה
        </button>
      )}
      {status === 'approved' && (
        <button
          type="submit"
          name="decision"
          value="suspended"
          disabled={pending}
          className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          השעיה
        </button>
      )}
      {state && 'error' in state && <span className="text-xs text-red-600">{state.error}</span>}
      {state && 'success' in state && <span className="text-xs text-green-600">✓</span>}
    </form>
  )
}
