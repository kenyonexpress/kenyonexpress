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

function getChannel(state: AuthState): 'sms' | 'whatsapp' {
  return state && 'success' in state && state.channel === 'whatsapp' ? 'whatsapp' : 'sms'
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
  const sentChannel = getChannel(sendState)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms')
  useEffect(() => {
    if (sentTo) {
      setConfirmed(sentTo)
      setChannel(sentChannel)
    }
  }, [sentTo, sentChannel])

  if (!confirmed) {
    return (
      <form action={sendAction} className="auth-form">
        <label htmlFor="otp-phone" className="auth-label">
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
          className="auth-input text-start"
        />
        {getError(sendState) && (
          <p role="alert" className="auth-notice auth-notice--error">
            {getError(sendState)}
          </p>
        )}
        <button type="submit" disabled={sendPending} className="auth-btn auth-btn--outline">
          {sendPending ? 'שולחים קוד...' : 'שליחת קוד'}
        </button>
      </form>
    )
  }

  return (
    <form action={verifyAction} className="auth-form">
      <input type="hidden" name="phone" value={confirmed} />
      {next && <input type="hidden" name="next" value={next} />}

      <p className="auth-otp-intro">
        {channel === 'whatsapp'
          ? `שלחנו קוד ב-WhatsApp ל-${confirmed}`
          : `שלחנו קוד ב-SMS ל-${confirmed}`}
      </p>

      <label htmlFor="otp-token" className="auth-label">
        {channel === 'whatsapp' ? 'הקוד מ-WhatsApp' : 'הקוד מה-SMS'}
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
        maxLength={6}
        placeholder="123456"
        data-code=""
        className="auth-input"
      />

      {getError(verifyState) && (
        <p role="alert" className="auth-notice auth-notice--error">
          {getError(verifyState)}
        </p>
      )}

      <button type="submit" disabled={verifyPending} className="auth-btn auth-btn--primary">
        {verifyPending ? 'מאמתים...' : 'כניסה'}
      </button>

      <button type="button" onClick={() => setConfirmed(null)} className="auth-btn auth-btn--link">
        שינוי מספר טלפון
      </button>
    </form>
  )
}
