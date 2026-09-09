'use client'

import { withdrawContactRequest } from '@/server/actions/supplier/contact-request'
import { useState, useTransition } from 'react'

/**
 * Taking back a request that has not been decided yet.
 *
 * The action sets `status = 'withdrawn'` rather than deleting the row -- 225
 * grants no DELETE at all -- so this is worded as "ביטול" and not "מחיקה". A
 * button labelled delete that leaves the row in an admin's history is a button
 * that lies about what it did.
 */
export default function WithdrawContactRequest({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawContactRequest(requestId)
            setError(result.ok ? null : (result.error ?? 'הביטול נכשל.'))
          })
        }
        className="min-h-11 text-xs font-semibold text-gray-500 underline disabled:opacity-60"
      >
        {pending ? 'מבטל...' : 'ביטול הבקשה'}
      </button>
      {error ? <output className="mt-1 block text-xs text-red-700">{error}</output> : null}
    </div>
  )
}
