'use client'

import { agorot, formatIls } from '@/lib/commerce/money'
import {
  RETURN_DESTINATION_LABELS,
  RETURN_REASONS,
  RETURN_STATE_LABELS,
  previewReturnRefund,
} from '@/lib/returns/policy'
import { decideReturnRequest } from '@/server/actions/returns-admin'
import type { ReturnRequest } from '@/server/queries/returns'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The decision panel for one customer return request (STEP 44). Approve
 * sends the row down the money path its destination names; reject closes it
 * with a note the customer receives. The fee checkbox is the admin's single
 * override of the customer's reason code.
 */
export default function ReturnRequestAdmin({
  request,
  compact = false,
}: {
  request: ReturnRequest
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [waiveFee, setWaiveFee] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const reason = request.reasonCode ? RETURN_REASONS[request.reasonCode] : null
  const preview = request.reasonCode
    ? previewReturnRefund({
        requestedAgorot: request.requestedAgorot,
        reasonCode: request.reasonCode,
        destination: request.destination,
      })
    : null
  const feeApplies = preview !== null && preview.feeAgorot > 0 && !waiveFee
  const decidable = request.state === 'requested' || request.state === 'approved'
  const dueDate = new Date(request.refundDueBy)
  const overdue = decidable && dueDate.getTime() < Date.now()

  function decide(decision: 'approve' | 'reject') {
    setError(null)
    setOk(null)
    startTransition(async () => {
      const result = await decideReturnRequest({
        refundId: request.id,
        decision,
        note,
        waiveFee,
      })
      if (result.ok) {
        setOk(
          result.decision === 'rejected'
            ? `הבקשה ${result.rma} נדחתה והלקוח עודכן.`
            : result.creditedAgorot === null
              ? `הבקשה ${result.rma} אושרה (ההזמנה כבר הייתה מזוכה).`
              : `הבקשה ${result.rma} אושרה: ${formatIls(agorot(result.creditedAgorot))} ${
                  request.destination === 'wallet' ? 'לארנק' : 'לכרטיס'
                }.`,
        )
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section
      className={`bg-white border rounded-xl p-5 ${overdue ? 'border-red-300' : 'border-gray-200'}`}
      data-testid="return-request-admin"
    >
      <h2 className="font-semibold text-gray-800 mb-2">
        בקשת החזרה <span dir="ltr">{request.rma}</span>{' '}
        <span className="text-xs font-normal text-gray-500">
          {RETURN_STATE_LABELS[request.state].label}
        </span>
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
        <dt className="text-gray-500">סיבה</dt>
        <dd>{reason?.label ?? request.ground}</dd>
        <dt className="text-gray-500">יעד</dt>
        <dd>{RETURN_DESTINATION_LABELS[request.destination]}</dd>
        <dt className="text-gray-500">סכום</dt>
        <dd>{formatIls(agorot(request.requestedAgorot))}</dd>
        <dt className="text-gray-500">מועד אחרון להחזר לפי חוק</dt>
        <dd className={overdue ? 'text-red-600 font-semibold' : ''}>
          {dueDate.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
          {overdue ? ' (חלף)' : ''}
        </dd>
        {request.note && (
          <>
            <dt className="text-gray-500">הערת הלקוח</dt>
            <dd className="whitespace-pre-wrap">{request.note}</dd>
          </>
        )}
      </dl>

      {decidable && (
        <div className="space-y-2">
          {request.destination === 'original_method' && preview && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={waiveFee}
                onChange={(e) => setWaiveFee(e.target.checked)}
                disabled={preview.feeAgorot === 0}
              />
              <span>
                {preview.feeAgorot === 0
                  ? 'ללא דמי ביטול (הסיבה פוטרת מדמי ביטול)'
                  : `ויתור על דמי ביטול (${formatIls(preview.feeAgorot)})`}
              </span>
            </label>
          )}
          <p className="text-xs text-gray-500">
            {request.destination === 'wallet'
              ? 'אישור יזכה את ארנק הלקוח במלוא הסכום, ללא דמי ביטול.'
              : feeApplies
                ? `אישור יחזיר לכרטיס ${formatIls(preview.refundAgorot)} אחרי דמי ביטול.`
                : `אישור יחזיר לכרטיס ${formatIls(agorot(request.requestedAgorot))}.`}
          </p>
          <textarea
            className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            rows={compact ? 1 : 2}
            placeholder="הערה ללקוח (חובה בדחייה)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => decide('approve')}
            >
              אישור והחזר
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-50"
              disabled={pending || note.trim().length === 0}
              onClick={() => decide('reject')}
            >
              דחייה
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {ok && <output className="mt-2 block text-sm text-green-700">{ok}</output>}
    </section>
  )
}
