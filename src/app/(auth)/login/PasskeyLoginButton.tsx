'use client'

import { beginPasskeyLogin, finishPasskeyLogin } from '@/server/actions/passkeys'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { useEffect, useState, useTransition } from 'react'

/**
 * The passkey way in: begin action, the browser's Face ID / fingerprint
 * prompt, finish action. On success the finish action redirects; every
 * failure lands here as one Hebrew sentence plus `onFallback`, which the
 * login form wires to opening the magic-link form, so a customer whose
 * passkey will not cooperate is one tap from the way in that always works.
 */
export default function PasskeyLoginButton({
  next,
  onFallback,
}: {
  next?: string
  onFallback: () => void
}) {
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Knowable only after hydration; the server renders nothing and the button
  // appears on capable browsers. No layout shift worth fighting: unsupported
  // browsers simply never see the option.
  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
  }, [])

  if (!supported) return null

  function signIn(): void {
    startTransition(async () => {
      setError(null)
      const begin = await beginPasskeyLogin()
      if ('error' in begin) {
        setError(begin.error)
        onFallback()
        return
      }
      let response: Awaited<ReturnType<typeof startAuthentication>>
      try {
        response = await startAuthentication({ optionsJSON: begin.options })
      } catch (cause) {
        // A cancelled prompt is a decision, not a failure: no error, no
        // fallback push, the customer is already looking at the other options.
        if (cause instanceof Error && cause.name === 'NotAllowedError') return
        setError('הכניסה עם המפתח נכשלה, אפשר להיכנס עם קישור לאימייל')
        onFallback()
        return
      }
      const finish = await finishPasskeyLogin(response, next)
      // Success never returns: the action redirects. A value means failure.
      if (finish && 'error' in finish) {
        setError(finish.error)
        onFallback()
      }
    })
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M7 8.5a5 5 0 0 1 10 0v3a10 10 0 0 1-1 4.5" />
          <path d="M12 8.5v3a14 14 0 0 1-1.5 6.5" />
          <path d="M9.5 8.5a2.5 2.5 0 0 1 5 0v3c0 1.5-.2 3-.6 4.4" />
          <path d="M7 13.5c0 2-.4 3.5-1 5" />
        </svg>
        {pending ? 'מאמתים...' : 'כניסה עם טביעת אצבע או Face ID'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}
