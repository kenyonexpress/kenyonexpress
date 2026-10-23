'use client'

import PasskeySignIn from '@/components/auth/PasskeySignIn'
import WhatsappOtpForm from '@/components/auth/WhatsappOtpForm'
import { GoogleLogo } from '@/components/shared/GoogleLogo'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type AuthState,
  checkAuthFallback,
  sendMagicLink,
  sendPhoneOtp,
  signInWithEmail,
  signInWithGoogle,
  verifyPhoneOtp,
} from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

// Embedded PhoneOtpForm component
function PhoneOtpForm({ next }: { next?: string }) {
  const [sendState, sendAction, sendPending] = useActionState<AuthState, FormData>(
    sendPhoneOtp,
    null,
  )
  const [verifyState, verifyAction, verifyPending] = useActionState<AuthState, FormData>(
    verifyPhoneOtp,
    null,
  )
  const [phone, setPhone] = useState('')

  const sentTo = getSuccess(sendState)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  useEffect(() => {
    if (sentTo) setConfirmed(sentTo)
  }, [sentTo])

  if (!confirmed) {
    return (
      <form action={sendAction} className="space-y-3">
        <label htmlFor="otp-phone" className="block text-sm font-medium text-gray-700">
          מספר טלפון נייד
        </label>
        <input
          id="otp-phone"
          name="phone"
          type="tel"
          required
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          placeholder="050-1234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-start placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
        {getError(sendState) && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {getError(sendState)}
          </p>
        )}
        <button
          type="submit"
          disabled={sendPending}
          className="w-full border border-brand text-heading hover:bg-brand/5 disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {sendPending ? 'שולחים קוד...' : 'שליחת קוד ב-SMS'}
        </button>
      </form>
    )
  }

  return (
    <form action={verifyAction} className="space-y-3">
      <input type="hidden" name="phone" value={confirmed} />
      {next && <input type="hidden" name="next" value={next} />}

      <p className="text-sm text-gray-600">{`שלחנו קוד ל-${confirmed}`}</p>

      <label htmlFor="otp-token" className="block text-sm font-medium text-gray-700">
        הקוד מה-SMS
      </label>
      <input
        id="otp-token"
        name="token"
        type="text"
        required
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={10}
        placeholder="123456"
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />

      {getError(verifyState) && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {getError(verifyState)}
        </p>
      )}

      <button
        type="submit"
        disabled={verifyPending}
        className="w-full bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
      >
        {verifyPending ? 'מאמתים...' : 'כניסה'}
      </button>

      <button
        type="button"
        onClick={() => setConfirmed(null)}
        className="w-full text-xs text-center text-gray-500 hover:text-link"
      >
        שינוי מספר טלפון
      </button>
    </form>
  )
}

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

function getSuccess(state: AuthState): string | null {
  return state && 'success' in state ? state.success : null
}

interface LoginModalProps {
  next?: string
  callbackError?: string
  magic?: string
  phoneEnabled?: boolean
}

export default function LoginModal({
  next,
  callbackError,
  magic,
  phoneEnabled = false,
}: LoginModalProps) {
  const [activeTab, setActiveTab] = useState('email')
  const [showFallbackMessage, setShowFallbackMessage] = useState(false)

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

  // Check if user should be shown email fallback after failed attempts
  // Note: This runs on every login page load. Since we don't have user identity
  // before login, we check based on IP address patterns stored in localStorage
  // as a client-side fingerprint. This is best-effort - the real check happens
  // server-side in the auth routes.
  useEffect(() => {
    async function checkFallback() {
      try {
        // Try to get email from localStorage if user was recently attempting login
        const recentEmail =
          typeof window !== 'undefined' ? localStorage.getItem('login_attempt_email') : null

        if (recentEmail) {
          const result = await checkAuthFallback({ email: recentEmail })
          if (result.shouldFallback) {
            setShowFallbackMessage(true)
            setActiveTab('magic') // Auto-switch to email magic link tab
          }
        }
      } catch {
        // Silently fail - fallback check is best-effort
      }
    }
    checkFallback()
  }, [])

  const topError =
    getError(googleState) ??
    (callbackError === 'auth_callback_error' ? 'הכניסה נכשלה — נסו שוב' : null)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-6 text-center">כניסה לחשבון</h2>

      {showFallbackMessage && (
        <div className="mb-4 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
          זוהו ניסיונות כניסה כושלים. אנחנו ממליצים להשתמש בקישור כניסה במייל.
        </div>
      )}

      {magic && !getSuccess(magicState) && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          בדקו את תיבת הדואר — שלחנו קישור כניסה
        </div>
      )}

      {topError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{topError}</div>
      )}

      {/* Social login - always visible */}
      <div className="space-y-3 mb-6">
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
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-500">או</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Auth method tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="email" className="text-xs sm:text-sm">
            אימייל
          </TabsTrigger>
          {phoneEnabled && (
            <TabsTrigger value="phone" className="text-xs sm:text-sm">
              SMS
            </TabsTrigger>
          )}
          <TabsTrigger value="passkey" className="text-xs sm:text-sm">
            Passkey
          </TabsTrigger>
          <TabsTrigger value="magic" className="text-xs sm:text-sm">
            קישור
          </TabsTrigger>
        </TabsList>

        {/* Email / Password Tab */}
        <TabsContent value="email" className="space-y-4">
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
                dir="ltr"
                aria-label="אימייל"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  סיסמה
                </label>
                <Link
                  href="/forgot-password"
                  className="-my-2 py-2 text-xs text-link hover:underline"
                >
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
                aria-label="סיסמה"
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
        </TabsContent>

        {/* Phone OTP Tab */}
        {phoneEnabled && (
          <TabsContent value="phone">
            <PhoneOtpForm next={next} />
          </TabsContent>
        )}

        {/* Passkey Tab */}
        <TabsContent value="passkey">
          <PasskeySignIn next={next} />
        </TabsContent>

        {/* Magic Link Tab */}
        <TabsContent value="magic" className="space-y-3">
          <p className="text-sm text-gray-600">קבלו קישור כניסה אחד שימוש בדוא"ל שלכם</p>
          <form action={magicAction} className="space-y-3">
            {next && <input type="hidden" name="next" value={next} />}
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
              dir="ltr"
              aria-label="אימייל לקישור כניסה"
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
              className="w-full border border-brand text-heading hover:bg-brand/5 disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              {magicPending ? 'שולחים...' : 'שלחו לי קישור'}
            </button>
          </form>
        </TabsContent>
      </Tabs>

      {/* Alternative auth option - WhatsApp */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-600 text-center mb-3">אל תרצו להשתמש בסיסמה?</p>
        <div className="w-full">
          <WhatsappOtpForm next={next} />
        </div>
      </div>

      {/* Sign up link */}
      <p className="mt-6 text-center text-sm text-gray-500">
        אין לכם חשבון?{' '}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="text-link font-medium hover:underline"
        >
          הרשמה
        </Link>
      </p>
    </div>
  )
}
