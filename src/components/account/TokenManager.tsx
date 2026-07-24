'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { deletePaymentToken, setDefaultPaymentToken } from '@/server/actions/account'
import type { AccountPaymentToken } from '@/server/queries/account'
import { useActionState } from 'react'

const INITIAL: AccountActionState = null

function Feedback({ state }: { state: AccountActionState }) {
  if (!state) return null
  if ('error' in state)
    return (
      <p className="account-alert account-alert--error" role="alert">
        {state.error}
      </p>
    )
  return <output className="account-alert account-alert--success">{state.success}</output>
}

function expiryLabel(month: number | null, year: number | null): string {
  if (!month || !year) return ''
  return `תוקף ${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

function isExpired(month: number | null, year: number | null): boolean {
  if (!month || !year) return false
  const now = new Date()
  // A card is valid through the last day of its expiry month.
  const endOfMonth = new Date(year, month, 1)
  return endOfMonth <= new Date(now.getFullYear(), now.getMonth(), 1)
}

function TokenRow({ token }: { token: AccountPaymentToken }) {
  const [deleteState, deleteActionFn, deletePending] = useActionState(deletePaymentToken, INITIAL)
  const [defaultState, defaultActionFn, defaultPending] = useActionState(
    setDefaultPaymentToken,
    INITIAL,
  )

  const expired = isExpired(token.expiryMonth, token.expiryYear)

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title">
          {token.cardBrand ?? 'כרטיס אשראי'} ···· {token.last4 ?? '****'}{' '}
          {token.isDefault && (
            <span className="account-chip account-chip--default">ברירת מחדל</span>
          )}
          {expired && <span className="account-chip account-chip--dead">פג תוקף</span>}
        </p>
        <p className="account-row__meta">{expiryLabel(token.expiryMonth, token.expiryYear)}</p>
        <Feedback state={deleteState} />
        <Feedback state={defaultState} />
      </div>
      <div className="account-row__actions">
        {!token.isDefault && !expired && (
          <form action={defaultActionFn}>
            <input type="hidden" name="id" value={token.id} />
            <button className="account-btn" type="submit" disabled={defaultPending}>
              קביעה כברירת מחדל
            </button>
          </form>
        )}
        <form action={deleteActionFn}>
          <input type="hidden" name="id" value={token.id} />
          <button
            className="account-btn account-btn--danger"
            type="submit"
            disabled={deletePending}
          >
            הסרה
          </button>
        </form>
      </div>
    </div>
  )
}

export default function TokenManager({ tokens }: { tokens: AccountPaymentToken[] }) {
  return (
    <section className="account-card">
      {tokens.length === 0 ? (
        <p className="account-empty">
          אין כרטיסים שמורים. כרטיס נשמר אוטומטית בתשלום הראשון, אם בחרת בכך.
        </p>
      ) : (
        tokens.map((token) => <TokenRow key={token.id} token={token} />)
      )}
    </section>
  )
}
