'use client'

import {
  approveImageSubmission,
  rejectImageSubmission,
} from '@/server/actions/admin/supplier-image-submissions'
import {
  approvePriceProposal,
  rejectPriceProposal,
} from '@/server/actions/admin/supplier-price-proposals'
import { Check, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * Approve / reject for the two section-54 queues. Rejection needs a reason:
 * a supplier reading "rejected" with nothing after it files the same request
 * again next week.
 */
export default function SupplierRequestActions({
  id,
  kind,
  label,
}: {
  id: string
  kind: 'price' | 'image'
  label: string
}) {
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  function handleApprove() {
    startTransition(async () => {
      const result =
        kind === 'price' ? await approvePriceProposal(id) : await approveImageSubmission(id)
      if (result && 'error' in result) toast.error(result.error)
      else toast.success(`${label}: אושר`)
    })
  }

  function handleReject() {
    if (reason.trim().length < 2) {
      toast.error('נדרשת סיבת דחייה')
      return
    }
    startTransition(async () => {
      const result =
        kind === 'price'
          ? await rejectPriceProposal(id, reason.trim())
          : await rejectImageSubmission(id, reason.trim())
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
        <label className="sr-only" htmlFor={`reason-${id}`}>
          סיבת דחייה
        </label>
        <input
          id={`reason-${id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="סיבת דחייה..."
          className="w-48 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ke-yellow"
        />
        <button
          type="button"
          onClick={handleReject}
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
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
        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        <Check size={13} aria-hidden="true" />
        אישור
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        <X size={13} aria-hidden="true" />
        דחייה
      </button>
    </div>
  )
}
