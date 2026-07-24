'use client'

import { type AuthState, signInWithGoogle, signUpWithEmail } from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState } from 'react'

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

interface Props {
  next?: string
}

export default function SignupForm({ next }: Props) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpWithEmail, null)
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )

  const topError = getError(googleState)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-6">יצירת חשבון</h2>

      {topError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{topError}</div>
      )}

      {/* Google sign-up */}
      <form action={googleAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          disabled={googlePending}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2a10 10 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18a8.59 8.59 0 0 0 5.96-2.18l-2.92-2.26a5.43 5.43 0 0 1-8.07-2.85H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3A5.43 5.43 0 0 1 9 3.58z"
            />
          </svg>
          {googlePending ? 'מתחברים...' : 'הרשמה עם Google'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400">או</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
            שם מלא
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            placeholder="ישראל ישראלי"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            אימייל
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            טלפון נייד{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="050-1234567"
            dir="ltr"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-start"
          />
          <p className="mt-1 text-xs text-gray-400">מספר ישראלי (050, 052, 054 וכו׳)</p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            סיסמה
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="לפחות 8 תווים + ספרה"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {getError(state) && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{getError(state)}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {pending ? 'יוצרים חשבון...' : 'הרשמה'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        כבר יש לכם חשבון?{' '}
        <Link href="/login" className="text-brand font-medium hover:underline">
          כניסה
        </Link>
      </p>
    </div>
  )
}
