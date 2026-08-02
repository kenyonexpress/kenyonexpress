'use client'

import { Trash2 } from 'lucide-react'
import { useState } from 'react'

interface Props {
  label?: string
  onConfirm: () => Promise<{ error?: string } | undefined>
}

export default function DeleteButton({ label = 'מחיקה', onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setPending(true)
    setError(null)
    try {
      const res = await onConfirm()
      if (res && 'error' in res && res.error) setError(res.error)
    } catch {
      setError('אירעה שגיאה')
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-sm text-gray-600">בטוח?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="text-xs text-red-600 font-medium hover:underline disabled:opacity-60"
        >
          {pending ? 'מוחק...' : 'כן, מחיקה'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          ביטול
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
    >
      <Trash2 size={14} />
      {label}
    </button>
  )
}
