'use client'

import TurnstileWidget from '@/components/fraud/TurnstileWidget'
import { GoogleLogo } from '@/components/shared/GoogleLogo'
import TurnstileRefresh from '@/components/turnstile/TurnstileRefresh'
import type { OtpChannel } from '@/lib/auth/whatsapp-cloud'
import { t } from '@/lib/i18n/messages'
import {
  type AuthState,
  sendMagicLink,
  signInWithEmail,
  signInWithGoogle,
} from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { AuthHeading } from '../AuthFrame'
import OtpSignInForm from './OtpSignInForm'
import PasskeyLoginButton from './PasskeyLoginButton'
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
  /**
   * S19: where the six-digit sign-in code goes. 'whatsapp' when Meta Cloud API
   * is configured on the server, 'email' otherwise. Decided by the page from
   * the env, never in the browser.
   */
  otpChannel?: OtpChannel
}

export default function LoginForm({
  next,
  callbackError,
  magic,
  phoneEnabled = false,
  otpChannel = 'email',
}: Props) {
  const [showMagic, setShowMagic] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const [showOtp, setShowOtp] = useState(false)

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
    (callbackError === 'auth_callback_error' ? t('auth.loginPage.callbackError') : null)

  /*
    V04, Electro's my-account order: the password form is the column's own
    form, as WooCommerce's `form.login` is, and every other way in sits under
    one "או" rule beneath it - Google, the passkey, the code, SMS and the
    magic link. The register door is the other column (`AuthAside`), so this
    component no longer carries its own "אין לכם חשבון?" line.
  */
  return (
    <div>
      <AuthHeading>{t('auth.loginPage.heading')}</AuthHeading>
      <p className="auth-col__lead">{t('auth.loginPage.lead')}</p>

      {magic && !getSuccess(magicState) && (
        <p className="auth-notice auth-notice--ok">{t('auth.loginPage.magicSent')}</p>
      )}

      {topError && (
        <div role="alert" className="auth-notice auth-notice--error">
          {topError}
        </div>
      )}

      {/* Email / password */}
      <form action={emailAction} className="auth-form">
        {next && <input type="hidden" name="next" value={next} />}

        <div className="auth-field">
          <label htmlFor="email">{t('auth.loginPage.emailLabel')}</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            /*
              An address is Latin on a Hebrew page, so the FIELD is LTR while
              the form around it stays RTL - the same call `NewsletterSignup`,
              `ContactForm` and the signup phone input already make, and the
              reasoning is written out in the first of those. MEASURED before
              this line existed: `you@example.com` sat flush RIGHT here and
              flush LEFT on /contact, one address rendered two ways on one site.
            */
            dir="ltr"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">{t('auth.loginPage.passwordLabel')}</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {getError(emailState) && (
          <p role="alert" className="auth-notice auth-notice--error">
            {getError(emailState)}
          </p>
        )}

        {/* The password form only. Google and passkey prove a person by other
            means, and the magic-link form mounts on demand, after implicit
            rendering has already scanned the page. */}
        <TurnstileWidget action="login" />
        <TurnstileRefresh resetOn={emailState} />

        <div className="auth-submit-row">
          <button type="submit" disabled={emailPending} className="auth-btn auth-btn--primary">
            {emailPending ? t('auth.loginPage.submitting') : t('auth.loginPage.submit')}
          </button>
          <Link href="/forgot-password" className="auth-link">
            {t('auth.loginPage.forgot')}
          </Link>
        </div>
      </form>

      <p className="auth-divider">{t('auth.loginPage.otherWays')}</p>

      <div className="auth-alt">
        <form action={googleAction}>
          {next && <input type="hidden" name="next" value={next} />}
          <button type="submit" disabled={googlePending} className="auth-btn auth-btn--outline">
            <GoogleLogo />
            {googlePending ? t('auth.loginPage.submitting') : t('auth.loginPage.google')}
          </button>
        </form>

        {/*
          Passkey, directly under Google: renders only on browsers that support
          WebAuthn, and its failure path opens the magic-link form below, which
          is the fallback that works on every device and every account.
        */}
        <PasskeyLoginButton next={next} onFallback={() => setShowMagic(true)} />

        {/*
          S19: the code sign-in. WhatsApp when the server can send one, email
          otherwise, so the button is never an offer the server cannot keep.
          Opening it swaps the button for the two-step form in place.
        */}
        {!showOtp ? (
          <button
            type="button"
            onClick={() => setShowOtp(true)}
            className="auth-btn auth-btn--outline"
          >
            {otpChannel === 'whatsapp' ? t('otpSignIn.openWhatsapp') : t('otpSignIn.openEmail')}
          </button>
        ) : (
          <OtpSignInForm channel={otpChannel} next={next} />
        )}

        {/* SMS only when a provider is wired; otherwise every send would fail. */}
        {phoneEnabled &&
          (!showPhone ? (
            <button
              type="button"
              onClick={() => setShowPhone(true)}
              className="auth-btn auth-btn--outline"
            >
              {t('auth.loginPage.smsOpen')}
            </button>
          ) : (
            <PhoneOtpForm next={next} />
          ))}

        {/* Magic link */}
        {!showMagic ? (
          <button
            type="button"
            onClick={() => setShowMagic(true)}
            className="auth-btn auth-btn--link"
          >
            {t('auth.loginPage.magicOpen')}
          </button>
        ) : (
          <form action={magicAction} className="auth-form">
            <div className="auth-field">
              <label htmlFor="magic-email">{t('auth.loginPage.magicLabel')}</label>
              <input
                id="magic-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                dir="ltr"
              />
            </div>
            {getSuccess(magicState) && (
              <p className="auth-notice auth-notice--ok">{getSuccess(magicState)}</p>
            )}
            {getError(magicState) && (
              <p role="alert" className="auth-notice auth-notice--error">
                {getError(magicState)}
              </p>
            )}
            <button type="submit" disabled={magicPending} className="auth-btn auth-btn--outline">
              {magicPending ? t('auth.loginPage.magicSending') : t('auth.loginPage.magicSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
