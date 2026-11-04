'use client'

import TurnstileWidget from '@/components/fraud/TurnstileWidget'
import { GoogleLogo } from '@/components/shared/GoogleLogo'
import TurnstileRefresh from '@/components/turnstile/TurnstileRefresh'
import { t } from '@/lib/i18n/messages'
import { type AuthState, signInWithGoogle, signUpWithEmail } from '@/server/actions/auth'
import { useActionState } from 'react'
import { AuthHeading } from '../AuthFrame'

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

  /*
    V04: WooCommerce's `form.register` as Electro lays it out - the fields are
    the column's own form and Google sits under an "או" rule beneath it, the
    same order as the sign-in column. The way back to sign-in is the other
    column (`AuthAside`).
  */
  return (
    <div>
      <AuthHeading>{t('auth.registerPage.heading')}</AuthHeading>
      <p className="auth-col__lead">{t('auth.registerPage.lead')}</p>

      {topError && (
        <div role="alert" className="auth-notice auth-notice--error">
          {topError}
        </div>
      )}

      <form action={action} className="auth-form">
        {next && <input type="hidden" name="next" value={next} />}

        <div className="auth-field">
          <label htmlFor="full_name">{t('auth.registerPage.fullNameLabel')}</label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            placeholder="ישראל ישראלי"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="email">{t('auth.registerPage.emailLabel')}</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            dir="ltr"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="phone">
            {t('auth.registerPage.phoneLabel')}{' '}
            <span className="auth-field__req" aria-hidden="true">
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
            className="text-start"
          />
          <p className="auth-field__hint">{t('auth.registerPage.phoneHint')}</p>
        </div>

        <div className="auth-field">
          <label htmlFor="password">{t('auth.registerPage.passwordLabel')}</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder={t('auth.registerPage.passwordPlaceholder')}
          />
        </div>

        {getError(state) && (
          <p role="alert" className="auth-notice auth-notice--error">
            {getError(state)}
          </p>
        )}

        {/* Renders nothing unless a Turnstile key pair is configured. The
            Google button below is a separate form and carries no challenge:
            Google has already decided that caller is a person. */}
        <TurnstileWidget action="signup" />
        <TurnstileRefresh resetOn={state} />

        <div className="auth-submit-row">
          <button type="submit" disabled={pending} className="auth-btn auth-btn--primary">
            {pending ? t('auth.registerPage.submitting') : t('auth.registerPage.submit')}
          </button>
        </div>
      </form>

      <p className="auth-divider">{t('auth.registerPage.otherWays')}</p>

      {/* Google sign-up */}
      <form action={googleAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <button type="submit" disabled={googlePending} className="auth-btn auth-btn--outline">
          <GoogleLogo />
          {googlePending ? t('auth.registerPage.googlePending') : t('auth.registerPage.google')}
        </button>
      </form>
    </div>
  )
}
