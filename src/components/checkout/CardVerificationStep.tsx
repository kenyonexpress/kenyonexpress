'use client'

import { useCallback, useState } from 'react'

export type CardVerificationStatus = 'idle' | 'loading' | 'verified' | 'failed'

interface CardVerificationStepProps {
  onSuccess?: () => void
  onError?: (error: string) => void
  disabled?: boolean
}

export function CardVerificationStep({
  onSuccess,
  onError,
  disabled = false,
}: CardVerificationStepProps) {
  const [status, setStatus] = useState<CardVerificationStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const startVerification = useCallback(async () => {
    try {
      setStatus('loading')
      setError(null)

      const response = await fetch('/api/payments/verify-card', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Verification failed with status ${response.status}`)
      }

      const result = await response.json()

      if (result.redirectUrl) {
        // Redirect to Cardcom's hosted page for card entry
        window.location.href = result.redirectUrl
      } else if (result.status === 'verified') {
        // Mock provider or instant verification
        setStatus('verified')
        onSuccess?.()
      } else {
        throw new Error('Unexpected response from verification endpoint')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Card verification failed'
      setError(message)
      setStatus('failed')
      onError?.(message)
    }
  }, [onSuccess, onError])

  const retry = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  if (status === 'verified') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">✓ כרטיس אשראי אומת בהצלחה</p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">✗ אימות הכרטיס נכשל</p>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={disabled}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          נסה שוב
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">אימות כרטיס אשראי בסך אגורה אחת שתוחזר מיד</p>
      <button
        type="button"
        onClick={startVerification}
        disabled={status === 'loading' || disabled}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'בדיקה בעיצומה...' : 'אימות כרטיס'}
      </button>
    </div>
  )
}
