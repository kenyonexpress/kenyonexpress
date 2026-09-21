'use client'

import { requeueInvoice } from '@/server/actions/admin/invoices'
import { RotateCcw } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

export default function RequeueInvoiceButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await requeueInvoice(id)
          if (result && 'error' in result) toast.error(result.error)
          else if (result) toast.success(result.success)
        })
      }
      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <RotateCcw size={13} aria-hidden="true" />
      החזרה לתור
    </button>
  )
}
