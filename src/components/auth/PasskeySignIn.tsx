'use client'

import { passkeysEnabled } from '@/lib/auth/passkeys-flag'
import { safeNextPath } from '@/lib/auth/safe-next'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { useEffect, useState } from 'react'

const ERRORS: Record<string, string> = {
  unknown_passkey: 'מפתח הגישה הזה לא מוכר. אפשר להיכנס בדרך אחרת ולהוסיף אותו מחדש.',
  no_email: 'לחשבון הזה אין מייל, ולכן אי אפשר להיכנס איתו במפתח גישה.',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
}

/** Sign in with a passkey stored on the device (rc5 F15). Hidden where unsupported. */
export default function PasskeySignIn({ next }: { next?: string }) {
  const [supported, setSupported] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupported(passkeysEnabled() && browserSupportsWebAuthn())
  }, [])
  if (!supported) return null

  async function signIn() {
    setPending(true)
    setError(null)
    try {
      const optionsRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: 'options' }),
      })
      const optionsJson = await optionsRes.json()
      if (!optionsJson.ok) throw new Error(optionsJson.error ?? 'options_failed')
      const assertion = await startAuthentication({ optionsJSON: optionsJson.options })
      const verifyRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: 'verify', response: assertion }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyJson.ok) throw new Error(verifyJson.error ?? 'verify_failed')
      window.location.assign(safeNextPath(next))
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      // A cancelled browser dialog is not an error worth shouting about.
      if (!/NotAllowedError|AbortError/.test(String((err as { name?: string })?.name))) {
        setError(ERRORS[code] ?? 'הכניסה במפתח גישה נכשלה. אפשר לנסות שוב או להיכנס בדרך אחרת.')
      }
      setPending(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        aria-label="כניסה עם מפתח גישה"
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {pending ? 'מאמתים...' : 'כניסה עם מפתח גישה'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
