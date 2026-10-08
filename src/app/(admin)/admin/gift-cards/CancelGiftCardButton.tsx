'use client'

import { cancelGiftCard } from '@/server/actions/admin/gift-cards'
import { useId, useState, useTransition } from 'react'

/**
 * Cancel one issued gift card (STEP 48). Reason first, confirm second, and
 * the action decides the rest under the row's status guard.
 */
export default function CancelGiftCardButton({ id, last4 }: { id: string; last4: string }) {
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (message?.tone === 'ok') {
    return <span className="text-xs text-green-700">{message.text}</span>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        ביטול
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${baseId}-reason`} className="text-xs text-gray-600">
        נימוק לביטול הכרטיס שמסתיים ב-{last4}
      </label>
      <input
        id={`${baseId}-reason`}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
        placeholder="למשל: ההזמנה זוכתה"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelGiftCard({ id, reason })
              if (result.error) setMessage({ tone: 'error', text: result.error })
              else setMessage({ tone: 'ok', text: result.success ?? 'בוטל' })
            })
          }
          className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? 'מבטל...' : 'אישור ביטול'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setMessage(null)
          }}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          חזרה
        </button>
      </div>
      {message?.tone === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {message.text}
        </p>
      )}
    </div>
  )
}
