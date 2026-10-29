'use client'

import { safeNextPath } from '@/lib/auth/safe-next'
import { useState } from 'react'

const ERRORS: Record<string, string> = {
  invalid_phone: 'נא להזין מספר נייד ישראלי.',
  invalid_code: 'הקוד הוא 6 ספרות.',
  wrong_code: 'הקוד שגוי.',
  expired: 'הקוד פג או נוצל. אפשר לבקש קוד חדש.',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
  disabled: 'כניסה בוואטסאפ אינה זמינה כרגע. אפשר להיכנס עם סיסמה או קישור במייל.',
  no_email: 'לחשבון הזה אין מייל, אפשר להיכנס עם קוד ב-SMS.',
}

/**
 * Sign in with a code sent to WhatsApp (rc5 F15). When WhatsApp cannot
 * deliver, the server sends the code to the account's email, and the second
 * step asks for that email so the right check runs.
 */
export default function WhatsappOtpForm({ next }: { next?: string }) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean
      error?: string
      message?: string
      channel?: 'whatsapp' | 'email'
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const r = await post('/api/auth/wa-otp/send', { phone })
    setPending(false)
    if (!r.ok) return setError(ERRORS[r.error ?? ''] ?? 'השליחה נכשלה.')
    setChannel(r.channel ?? 'whatsapp')
    setMessage(r.message ?? null)
    setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const body = channel === 'email' ? { email, code } : { phone, code }
    const r = await post('/api/auth/wa-otp/verify', body)
    if (!r.ok) {
      setPending(false)
      return setError(ERRORS[r.error ?? ''] ?? 'הכניסה נכשלה.')
    }
    window.location.assign(safeNextPath(next))
  }

  return step === 'phone' ? (
    <form onSubmit={send} className="space-y-3">
      <label className="block text-sm">
        מספר נייד
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {/* Not `.account-btn`: that class lives in account.css, which the (auth)
          layout never loads, so on /login the button had no padding and
          measured 21px tall. These are the login form's own button styles. */}
      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-11 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-heading transition-colors hover:bg-gray-50 disabled:opacity-60"
        aria-label="שליחת קוד בוואטסאפ"
      >
        {pending ? 'שולחים...' : 'שליחת קוד בוואטסאפ'}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-3">
      {message && <p className="text-sm text-gray-700">{message}</p>}
      {channel === 'email' && (
        <label className="block text-sm">
          המייל של החשבון
          <input
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      )}
      <label className="block text-sm">
        קוד בן 6 ספרות
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          dir="ltr"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="account-btn w-full"
        aria-label="כניסה עם הקוד"
      >
        {pending ? 'בודקים...' : 'כניסה'}
      </button>
    </form>
  )
}
