'use client'

import { GoogleLogo } from '@/components/shared/GoogleLogo'
import {
  type AuthState,
  sendMagicLink,
  signInWithEmail,
  signInWithGoogle,
} from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import PhoneOtpForm from './PhoneOtpForm'

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

function getSuccess(state: AuthState): string | null {
  return state && 'success' in state ? state.success : null
}

interface Props {
  next?: string
  callbackError?: string
  magic?: string
  /**
   * Whether an SMS provider is actually wired into the Supabase project. False
   * hides the option entirely rather than showing a button that always fails:
   * without a provider, every send returns an error the customer cannot act on.
   */
  phoneEnabled?: boolean
}

export default function LoginForm({ next, callbackError, magic, phoneEnabled = false }: Props) {
  const [showMagic, setShowMagic] = useState(false)
  const [showPhone, setShowPhone] = useState(false)

  const [emailState, emailAction, emailPending] = useActionState<AuthState, FormData>(
    signInWithEmail,
    null,
  )
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )
  const [magicState, magicAction, magicPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    null,
  )

  const topError =
    getError(googleState) ??
    (callbackError === 'auth_callback_error' ? 'הכניסה נכשלה — נסו שוב' : null)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-6">כניסה לחשבון</h2>

      {magic && !getSuccess(magicState) && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          בדקו את תיבת הדואר — שלחנו קישור כניסה
        </div>
      )}

      {topError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{topError}</div>
      )}

      {/* Google sign-in */}
      <form action={googleAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          disabled={googlePending}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <GoogleLogo />
          {googlePending ? 'מתחברים...' : 'כניסה עם Google'}
        </button>
      </form>

      {/*
        Directly under Google, not buried below the password form. This is the
        route for shoppers who have no Google account, and it is worth nothing
        if they have to scroll past a password field to find it.
      */}
      {phoneEnabled && (
        <div className="mt-3">
          {!showPhone ? (
            <button
              type="button"
              onClick={() => setShowPhone(true)}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              כניסה עם קוד ב-SMS
            </button>
          ) : (
            <PhoneOtpForm next={next} />
          )}
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400">או</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Email / password */}
      <form action={emailAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

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
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              סיסמה
            </label>
            <Link href="/forgot-password" className="text-xs text-brand hover:underline">
              שכחתם סיסמה?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        {getError(emailState) && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {getError(emailState)}
          </p>
        )}

        <button
          type="submit"
          disabled={emailPending}
          className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {emailPending ? 'מתחברים...' : 'כניסה'}
        </button>
      </form>

      {/* Magic link */}
      <div className="mt-5">
        {!showMagic ? (
          <button
            type="button"
            onClick={() => setShowMagic(true)}
            className="w-full text-sm text-center text-gray-500 hover:text-brand"
          >
            כניסה ללא סיסמה (קישור מאובטח לאימייל)
          </button>
        ) : (
          <form action={magicAction} className="space-y-3">
            <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700">
              אימייל לקישור כניסה
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            {getSuccess(magicState) && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                {getSuccess(magicState)}
              </p>
            )}
            {getError(magicState) && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {getError(magicState)}
              </p>
            )}
            <button
              type="submit"
              disabled={magicPending}
              className="w-full border border-brand text-brand hover:bg-brand/5 disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              {magicPending ? 'שולחים...' : 'שלחו לי קישור'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-gray-500">
        אין לכם חשבון?{' '}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="text-brand font-medium hover:underline"
        >
          הרשמה
        </Link>
      </p>
    </div>
  )
}
