'use client'

import { type UpdateAlertState, updateFraudAlert } from '@/server/actions/fraud'
import { useRouter } from 'next/navigation'
import { useActionState, useState } from 'react'

export function FraudAlertActions({
  alertId,
  currentStatus,
}: {
  alertId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [state, formAction, isPending] = useActionState<UpdateAlertState, FormData>(
    updateFraudAlert,
    null,
  )

  const handleUpdate = (newStatus: string) => {
    const form = new FormData()
    form.set('alert_id', alertId)
    form.set('status', newStatus)
    if (notes.trim()) {
      form.set('notes', notes.trim())
    }
    formAction(form)
  }

  // Refresh after successful update
  if (state && 'success' in state) {
    router.refresh()
  }

  return (
    <div className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">פעולות</h2>

      {state && 'error' in state && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      {state && 'success' in state && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          ההתראה עודכנה בהצלחה
        </div>
      )}

      <div>
        <label htmlFor="notes" className="mb-2 block text-sm font-medium text-gray-700">
          הערות
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="הוסף הערות לביקורת..."
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => handleUpdate('reviewed')}
          disabled={isPending || currentStatus === 'reviewed'}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          סמן כנבדק
        </button>

        <button
          type="button"
          onClick={() => handleUpdate('approved')}
          disabled={isPending || currentStatus === 'approved'}
          className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          אשר
        </button>

        <button
          type="button"
          onClick={() => handleUpdate('blocked')}
          disabled={isPending || currentStatus === 'blocked'}
          className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          חסום
        </button>
      </div>

      <div className="pt-4 text-xs text-gray-500">
        סטטוס נוכחי: <strong>{currentStatus}</strong>
      </div>
    </div>
  )
}
