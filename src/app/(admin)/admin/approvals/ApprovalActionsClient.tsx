'use client'

import { approveProduct, rejectProduct } from '@/server/actions/admin/approvals'
import { Check, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

interface Props {
  productId: string
  productName: string
}

export default function ApprovalActionsClient({ productId, productName }: Props) {
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  function handleApprove() {
    startTransition(async () => {
      const result = await approveProduct(productId)
      if (result.error) toast.error(result.error)
      else toast.success(`"${productName}" אושר`)
    })
  }

  function handleReject() {
    if (reason.trim().length < 2) {
      toast.error('נדרשת סיבת דחייה')
      return
    }
    startTransition(async () => {
      const result = await rejectProduct(productId, reason.trim())
      if (result.error) toast.error(result.error)
      else {
        toast.success(`"${productName}" נדחה`)
        setRejecting(false)
        setReason('')
      }
    })
  }

  if (rejecting) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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
          className="text-xs text-gray-500 hover:underline"
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
        <Check size={13} />
        אישור
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
      >
        <X size={13} />
        דחייה
      </button>
    </div>
  )
}
