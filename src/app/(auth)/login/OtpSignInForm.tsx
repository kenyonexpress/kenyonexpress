'use client'

import type { OtpChannel } from '@/lib/auth/whatsapp-cloud'
import { t } from '@/lib/i18n/messages'
import { type OtpState, sendSignInCode, verifySignInCode } from '@/server/actions/otp-sign-in'
import { useActionState, useEffect, useState } from 'react'

/**
 * S19: sign in with a six-digit code. WhatsApp when the server has Meta Cloud
 * API configured, email when it does not, and email again if a WhatsApp send
 * fails at runtime (the action answers `fallback: 'email'`).
 *
 * The channel arrives as a prop from the server page, the same arrangement as
 * `phoneEnabled`: one decision, made where the env lives, so the browser can
 * never show a WhatsApp field the server cannot serve.
 */

function errorOf(state: OtpState): string | null {
  return state && 'error' in state ? state.error : null
}

const inputClass =
  'w-full min-h-touch-min rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent'

export default function OtpSignInForm({
  channel: initialChannel,
  next,
}: {
  channel: OtpChannel
  next?: string
}) {
  const [sendState, sendAction, sendPending] = useActionState<OtpState, FormData>(
    sendSignInCode,
    null,
  )
  const [verifyState, verifyAction, verifyPending] = useActionState<OtpState, FormData>(
    verifySignInCode,
    null,
  )
  const [channel, setChannel] = useState<OtpChannel>(initialChannel)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (sendState && 'sent' in sendState) {
      setSentTo(sendState.to)
      setChannel(sendState.channel)
    } else if (sendState && 'fallback' in sendState && sendState.fallback === 'email') {
      setChannel('email')
    }
  }, [sendState])

  useEffect(() => {
    if (verifyState && 'fallback' in verifyState && verifyState.fallback === 'email') {
      setChannel('email')
      setSentTo(null)
    }
  }, [verifyState])

  const isWhatsApp = channel === 'whatsapp'
  // After a fallback, the verify error stays on screen above the email field
  // so the customer reads why the form changed under them.
  const carriedError =
    !sentTo && verifyState && 'fallback' in verifyState ? verifyState.error : null

  if (!sentTo) {
    return (
      <form action={sendAction} className="space-y-3" data-testid="otp-send-form">
        <input type="hidden" name="channel" value={channel} />
        <label htmlFor="otp-target" className="block text-sm font-medium text-gray-700">
          {isWhatsApp ? t('otpSignIn.phoneLabel') : t('otpSignIn.emailLabel')}
        </label>
        {isWhatsApp ? (
          <input
            key="phone"
            id="otp-target"
            name="phone"
            type="tel"
            required
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="050-1234567"
            className={inputClass}
          />
        ) : (
          <input
            key="email"
            id="otp-target"
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
        )}
        {(errorOf(sendState) ?? carriedError) && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {errorOf(sendState) ?? carriedError}
          </p>
        )}
        <button
          type="submit"
          disabled={sendPending}
          className="w-full min-h-touch-min border border-brand text-heading hover:bg-brand/5 disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {sendPending ? t('otpSignIn.sending') : t('otpSignIn.send')}
        </button>
      </form>
    )
  }

  return (
    <form action={verifyAction} className="space-y-3" data-testid="otp-verify-form">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name={isWhatsApp ? 'phone' : 'email'} value={sentTo} />
      {next && <input type="hidden" name="next" value={next} />}

      <p className="text-sm text-gray-600">
        {isWhatsApp ? t('otpSignIn.sentWhatsapp') : t('otpSignIn.sentEmail')}
        <bdi dir="ltr">{sentTo}</bdi>
      </p>

      <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700">
        {t('otpSignIn.codeLabel')}
      </label>
      <input
        id="otp-code"
        name="token"
        type="text"
        required
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="123456"
        className={`${inputClass} text-center text-lg tracking-[0.4em] placeholder:tracking-normal`}
      />

      {errorOf(verifyState) && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {errorOf(verifyState)}
        </p>
      )}

      <button
        type="submit"
        disabled={verifyPending}
        className="w-full min-h-touch-min bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors"
      >
        {verifyPending ? t('otpSignIn.verifying') : t('otpSignIn.verify')}
      </button>

      <button
        type="button"
        onClick={() => setSentTo(null)}
        className="w-full min-h-touch-min text-xs text-center text-gray-500 hover:text-link"
      >
        {isWhatsApp ? t('otpSignIn.changePhone') : t('otpSignIn.changeEmail')}
      </button>
    </form>
  )
}
