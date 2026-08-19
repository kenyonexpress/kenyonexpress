'use client'

import { GoogleLogo } from '@/components/shared/GoogleLogo'
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
          <GoogleLogo />
          {googlePending ? 'מתחברים...' : 'הרשמה עם Google'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-500">או</span>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-right"
          />
          <p className="mt-1 text-xs text-gray-500">מספר ישראלי (050, 052, 054 וכו׳)</p>
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
          className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {pending ? 'יוצרים חשבון...' : 'הרשמה'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        כבר יש לכם חשבון?{' '}
        <Link href="/login" className="text-link font-medium hover:underline">
          כניסה
        </Link>
      </p>
    </div>
  )
}
