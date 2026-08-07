'use client'

import { canApprove, canCancel, canMarkPaid, isHeld } from '@/lib/admin/payouts'
import {
  approvePayoutStatement,
  cancelPayoutStatement,
  markPayoutStatementPaid,
} from '@/server/actions/admin/payouts'
import { BadgeCheck, Ban, Banknote } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

interface Props {
  statementId: string
  statementNumber: string
  status: string
  rolledOver: boolean
  availableAt: string | null
}

export default function PayoutActionsClient({
  statementId,
  statementNumber,
  status,
  rolledOver,
  availableAt,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [paying, setPaying] = useState(false)
  const [reference, setReference] = useState('')

  const row = { status, rolled_over: rolledOver, available_at: availableAt }
  // The trigger from migration 051 refuses a payment before every line has
  // cleared its hold. Disabling the button says so up front instead of letting
  // the admin press it and read a Postgres exception.
  const held = isHeld(row)

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await fn()
      if (result.error) toast.error(result.error)
      else toast.success(result.success ?? 'בוצע')
    })
  }

  if (paying) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="אסמכתת העברה..."
          aria-label={`אסמכתת תשלום לדוח ${statementNumber}`}
          className="w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await markPayoutStatementPaid({ statementId, reference })
              if (!result.error) {
                setPaying(false)
                setReference('')
              }
              return result
            })
          }
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          סמן כשולם
        </button>
        <button
          type="button"
          onClick={() => setPaying(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          ביטול
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {canApprove(row) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approvePayoutStatement(statementId))}
          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
        >
          <BadgeCheck size={13} />
          אישור
        </button>
      )}

      {canMarkPaid(row) && (
        <button
          type="button"
          disabled={pending || held}
          title={held ? 'הדוח עדיין בתקופת ההחזקה של 3 ימי עסקים' : undefined}
          onClick={() => setPaying(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
        >
          <Banknote size={13} />
          תשלום
        </button>
      )}

      {canCancel(row) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelPayoutStatement(statementId))}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          <Ban size={13} />
          ביטול
        </button>
      )}
    </div>
  )
}
