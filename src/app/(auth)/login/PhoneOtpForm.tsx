'use client'

import { type AuthState, sendPhoneOtp, verifyPhoneOtp } from '@/server/actions/auth'
import { useActionState, useEffect, useState } from 'react'

/**
 * Sign in with an SMS code.
 *
 * WHY IT EXISTS ALONGSIDE GOOGLE. A large share of Israeli shoppers have no
 * Google account and will not open one to buy a coupon. Email plus a password
 * is the other route and it is worse on a phone: it needs a password they have
 * to invent, remember and later reset.
 *
 * TWO STEPS IN ONE COMPONENT, AND THE PHONE IS CARRIED FORWARD RATHER THAN
 * RE-TYPED. The verify action needs the same number the code was sent to; a
 * second input would let the two drift and produce "the code is wrong" for a
 * customer whose code was fine.
 */

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

function getSuccess(state: AuthState): string | null {
  return state && 'success' in state ? state.success : null
}

export default function PhoneOtpForm({ next }: { next?: string }) {
  const [sendState, sendAction, sendPending] = useActionState<AuthState, FormData>(
    sendPhoneOtp,
    null,
  )
  const [verifyState, verifyAction, verifyPending] = useActionState<AuthState, FormData>(
    verifyPhoneOtp,
    null,
  )
  const [phone, setPhone] = useState('')

  // The send action returns the E.164 number it actually used, which is what
  // the verify step must send back. Reading it from the action's result rather
  // than re-normalising in the browser keeps one normaliser in the system.
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-right placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
        // Lets iOS and Android offer the code straight from the SMS banner,
        // which is the difference between one tap and switching apps.
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
