'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { updateProfileDetails } from '@/server/actions/account'
import { useActionState } from 'react'

const INITIAL: AccountActionState = null

export default function ProfileDetailsForm({
  fullName,
  phone,
  email,
}: {
  fullName: string | null
  phone: string | null
  email: string
}) {
  const [state, action, pending] = useActionState(updateProfileDetails, INITIAL)

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

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="full_name">
            שם מלא
          </label>
          <input
            className="account-field__input"
            id="full_name"
            name="full_name"
            defaultValue={fullName ?? ''}
            required
            autoComplete="name"
          />
        </div>

        <div className="account-field">
          <label className="account-field__label" htmlFor="phone">
            טלפון
          </label>
          <input
            className="account-field__input"
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            defaultValue={phone ?? ''}
            required
            autoComplete="tel"
            placeholder="050-0000000"
          />
        </div>
      </div>

      <div className="account-field">
        <label className="account-field__label" htmlFor="email">
          אימייל
        </label>
        {/* Identity comes from the OAuth provider, so the address is not editable here. */}
        <input className="account-field__input" id="email" value={email} disabled readOnly />
      </div>

      <div>
        <button className="account-btn account-btn--primary" type="submit" disabled={pending}>
          {pending ? 'שומר...' : 'שמירת פרטים'}
        </button>
      </div>
    </form>
  )
}
