'use client'

import {
  approveContactRequest,
  rejectContactRequest,
} from '@/server/actions/admin/supplier-contact-requests'
import { Check, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * Approve applies the value; reject needs a reason.
 *
 * Same shape as `ApprovalActionsClient` next door, and the asymmetry is the
 * same: approving is one click because the request already says what it wants,
 * while rejecting without a sentence leaves a supplier with a closed request
 * and no idea what to file instead.
 */
export default function ContactRequestActions({
  requestId,
  label,
}: {
  requestId: string
  label: string
}) {
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  function handleApprove() {
    startTransition(async () => {
      const result = await approveContactRequest(requestId)
      if (result && 'error' in result) toast.error(result.error)
      else toast.success(`${label} עודכן`)
    })
  }

  function handleReject() {
    if (reason.trim().length < 2) {
      toast.error('נדרשת סיבת דחייה')
      return
    }
    startTransition(async () => {
      const result = await rejectContactRequest(requestId, reason.trim())
      if (result && 'error' in result) toast.error(result.error)
      else {
        toast.success('הבקשה נדחתה')
        setRejecting(false)
        setReason('')
      }
    })
  }

  if (rejecting) {
    return (
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`reason-${requestId}`}>
          סיבת דחייה
        </label>
        <input
          id={`reason-${requestId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="סיבת דחייה..."
          className="w-48 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="button"
          onClick={handleReject}
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          דחייה
        </button>
        <button
          type="button"
          onClick={() => setRejecting(false)}
          className="rounded-lg px-2 py-1.5 text-xs text-gray-500"
        >
          ביטול
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
      >
        <Check size={13} aria-hidden="true" />
        אישור
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        <X size={13} aria-hidden="true" />
        דחייה
      </button>
    </div>
  )
}
