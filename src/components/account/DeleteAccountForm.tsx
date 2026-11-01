'use client'

import { DELETE_CONFIRM_WORD } from '@/lib/account/deletion-confirm'
import type { AccountActionState } from '@/lib/validations/account'
import { deleteMyAccount } from '@/server/actions/privacy'
import { useActionState } from 'react'

const INITIAL: AccountActionState = null

/**
 * The confirmation word is typed, not checked in a checkbox, because this is
 * the one form in the account where a habitual click must not be enough. The
 * server verifies the same word again; this field is UX, not the guard.
 */
export default function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccount, INITIAL)

  return (
    <form action={action} className="account-form">
      {state && 'error' in state && (
        <p className="account-alert account-alert--error" role="alert">
          {state.error}
        </p>
      )}

      <div className="account-field">
        <label className="account-field__label" htmlFor="confirm">
          כדי לאשר, הקלידו כאן את המילה "{DELETE_CONFIRM_WORD}"
        </label>
        <input
          className="account-field__input"
          id="confirm"
          name="confirm"
          required
          autoComplete="off"
          placeholder={DELETE_CONFIRM_WORD}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg border border-red-600 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? 'מוחק את החשבון...' : 'מחיקת החשבון לצמיתות'}
      </button>
    </form>
  )
}
