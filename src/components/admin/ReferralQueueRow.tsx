'use client'

import { approveReferral, rejectReferral } from '@/server/actions/admin/referrals'
import { useState, useTransition } from 'react'

/**
 * One decision in the referral queue.
 *
 * Approving pays two wallets, so it is not a bare button: it asks once. The
 * cost of a mis-click here is real money to a possibly fraudulent account, and
 * the cost of one extra click is nothing.
 */
export default function ReferralQueueRow({
  id,
  status,
  referrerEmail,
  referredEmail,
  bonus,
  referrerPaidCount,
  reasons,
}: {
  id: string
  status: string
  referrerEmail: string | null
  referredEmail: string | null
  bonus: string
  referrerPaidCount: number
  reasons: string[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (done) {
    return (
      <li className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
        {referredEmail} — {done === 'approved' ? 'אושר ושולם' : 'נדחה'}
      </li>
    )
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, mark: 'approved' | 'rejected') =>
    start(async () => {
      setError(null)
      const result = await fn()
      if (result.ok) setDone(mark)
      else setError(result.error ?? 'הפעולה נכשלה')
    })

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-gray-500">ממליץ: </span>
            <bdi dir="ltr">{referrerEmail ?? '—'}</bdi>
            {referrerPaidCount > 0 && (
              <span className="mr-2 text-xs text-gray-500">
                (שולמו לו כבר <bdi>{referrerPaidCount}</bdi>)
              </span>
            )}
          </p>
          <p>
            <span className="text-gray-500">מומלץ: </span>
            <bdi dir="ltr">{referredEmail ?? '—'}</bdi>
          </p>
          <p>
            <span className="text-gray-500">בונוס: </span>
            <bdi>{bonus}</bdi>
          </p>
        </div>

        {status === 'flagged' && (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">סומן</span>
        )}
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1 rounded bg-amber-50 p-3 text-xs text-amber-900">
          {reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${id}`} className="block text-xs font-medium">
            סיבת הדחייה
          </label>
          <input
            id={`reason-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="למשל: אותו מכשיר, שני חשבונות של אותו אדם"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => rejectReferral(id, reason), 'rejected')}
              className="rounded bg-red-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              דחייה
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded border px-3 py-1.5 text-xs"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-700">
            לאשר ולזכות את שני הארנקים ב<bdi>{bonus}</bdi>?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => approveReferral(id), 'approved')}
            className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {pending ? 'משלם...' : 'כן, שלם'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded border px-3 py-1.5 text-xs"
          >
            ביטול
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded bg-black px-3 py-1.5 text-xs text-white"
          >
            אישור ותשלום
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded border px-3 py-1.5 text-xs"
          >
            דחייה
          </button>
        </div>
      )}
    </li>
  )
}
