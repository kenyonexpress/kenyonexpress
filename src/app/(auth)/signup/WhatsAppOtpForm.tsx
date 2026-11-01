'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function normalizeTelephoneNumber(tel: string): string {
  const cleaned = tel.replace(/\D/g, '')
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+972${cleaned.slice(1)}`
  }
  if (!cleaned.startsWith('972') && cleaned.length === 9) {
    return `+972${cleaned}`
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`
  }
  return tel
}

interface WhatsAppOtpFormProps {
  phone: string
  onVerified: (verifiedPhone: string) => void
  onCancel: () => void
}

export default function WhatsAppOtpForm({ phone, onVerified, onCancel }: WhatsAppOtpFormProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const normalizedPhone = normalizeTelephoneNumber(phone)

  // Send OTP on mount
  useEffect(() => {
    const sendOtp = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: normalizedPhone }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to send OTP')
        }

        setResendCountdown(60)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send OTP')
      } finally {
        setLoading(false)
      }
    }

    sendOtp()
  }, [normalizedPhone])

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown <= 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    timerRef.current = setInterval(() => {
      setResendCountdown((prev) => prev - 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [resendCountdown])

  const handleResend = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send OTP')
      }

      setResendCountdown(60)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP')
    } finally {
      setLoading(false)
    }
  }, [normalizedPhone])

  const handleVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!code || code.length !== 6) {
        setError('קוד חייב להיות 6 ספרות')
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: normalizedPhone,
            code,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to verify OTP')
        }

        onVerified(normalizedPhone)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify OTP')
      } finally {
        setLoading(false)
      }
    },
    [code, normalizedPhone, onVerified],
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-600 mb-3">{`שלחנו קוד לוואטסאפ ל-${normalizedPhone}`}</p>

        <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700 mb-2">
          קוד אימות
        </label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(value)
          }}
          maxLength={6}
          placeholder="000000"
          dir="ltr"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="button"
        onClick={handleVerify}
        disabled={loading || code.length !== 6}
        className="w-full bg-brand text-brand-dark font-semibold rounded-lg py-2.5 text-sm hover:bg-brand/90 disabled:opacity-60 transition-colors"
      >
        {loading ? 'אימות...' : 'אימות'}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 text-xs text-center text-gray-500 hover:text-link disabled:opacity-60"
        >
          שינוי מספר טלפון
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={loading || resendCountdown > 0}
          className="flex-1 text-xs text-center text-gray-500 hover:text-link disabled:opacity-60"
        >
          {resendCountdown > 0 ? `שליחה חוזרת ב-${resendCountdown}s` : 'שליחה חוזרת'}
        </button>
      </div>
    </div>
  )
}
