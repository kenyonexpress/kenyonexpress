'use client'

import { type AuthState, changePassword } from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState } from 'react'

/**
 * Change password from inside the account. The current password is a field
 * here and not a checkbox: the server re-proves it against GoTrue before it
 * touches anything, so a device that merely holds the cookies cannot lock
 * the owner out. Customers who came in through Google, a mail link or a
 * passkey and never set a password are pointed at recovery, which is the
 * one flow that sets a first password without knowing an old one.
 */
export default function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, null)

  return (
    <form action={action} className="account-form">
      {state && 'error' in state && (
        <p className="account-alert account-alert--error" role="alert">
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <output className="account-alert account-alert--success">{state.success}</output>
      )}

      <div className="account-field">
        <label className="account-field__label" htmlFor="current_password">
          הסיסמה הנוכחית
        </label>
        <input
          className="account-field__input"
          id="current_password"
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
        />
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="new_password">
            סיסמה חדשה
          </label>
          <input
            className="account-field__input"
            id="new_password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            dir="ltr"
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="confirm_password">
            אישור הסיסמה החדשה
          </label>
          <input
            className="account-field__input"
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            dir="ltr"
          />
        </div>
      </div>

      <p className="account-row__meta">
        לפחות 8 תווים וספרה אחת. נכנסתם עם Google או עם קישור ואין לכם סיסמה?{' '}
        <Link href="/forgot-password">קבעו סיסמה דרך שחזור סיסמה</Link>.
      </p>

      <div>
        <button className="account-btn account-btn--primary" type="submit" disabled={pending}>
          {pending ? 'מעדכן...' : 'עדכון סיסמה'}
        </button>
      </div>
    </form>
  )
}
