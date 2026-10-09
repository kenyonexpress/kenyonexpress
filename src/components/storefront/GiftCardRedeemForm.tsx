'use client'

import {
  type GiftCardBalanceState,
  type GiftCardRedeemState,
  checkGiftCardBalance,
  redeemGiftCard,
} from '@/server/actions/gift-cards'
import Link from 'next/link'
import { useActionState, useId } from 'react'

const EMPTY_BALANCE: GiftCardBalanceState = { ok: false }
const EMPTY_REDEEM: GiftCardRedeemState = { ok: false }

const fieldClass =
  'w-full min-h-11 rounded-lg border border-border bg-white px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand-primary/40'

const buttonClass =
  'min-h-11 rounded-lg bg-brand-primary px-5 text-sm font-semibold text-heading disabled:opacity-60'

function formatIls(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL', {
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

const STATE_LABELS_HE: Record<string, string> = {
  active: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
}

function BalanceResult({ state }: { state: GiftCardBalanceState }) {
  if (!state.ok || !state.state) return null
  const label = STATE_LABELS_HE[state.state] ?? state.state
  const expiry = state.expiresAt
    ? new Date(state.expiresAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null
  return (
    <output className="mt-4 block rounded-lg border border-border bg-white p-4 text-sm">
      <p className="font-semibold text-heading">מצב הכרטיס: {label}</p>
      <p className="mt-1 text-heading">
        יתרה: <span className="font-bold">{formatIls(state.balanceAgorot ?? 0)}</span>
      </p>
      {state.state === 'active' && expiry && (
        <p className="mt-1 text-heading/70">בתוקף עד {expiry}.</p>
      )}
    </output>
  )
}

/**
 * One code field, two submit buttons: check the balance, or redeem into the
 * wallet. Redemption without a session gets a login link instead of a refusal
 * after typing 16 characters.
 */
export default function GiftCardRedeemForm({ signedIn }: { signedIn: boolean }) {
  const [balance, balanceAction, balancePending] = useActionState(
    checkGiftCardBalance,
    EMPTY_BALANCE,
  )
  const [redeem, redeemAction, redeemPending] = useActionState(redeemGiftCard, EMPTY_REDEEM)
  const baseId = useId()
  const pending = balancePending || redeemPending

  if (redeem.ok) {
    return (
      <output className="block max-w-lg rounded-lg border border-border bg-white p-6">
        <p className="text-lg font-bold text-heading">
          הקוד מומש! {formatIls(redeem.creditedAgorot ?? 0)} נטענו לארנק שלך.
        </p>
        <p className="mt-2 text-sm text-heading/80">
          היתרה זמינה לתשלום בכל רכישה באתר.{' '}
          <Link href="/account/wallet" className="font-medium underline underline-offset-2">
            לצפייה בארנק
          </Link>
        </p>
      </output>
    )
  }

  return (
    <div className="max-w-lg">
      <form className="flex flex-col gap-4" noValidate>
        <div>
          <label
            htmlFor={`${baseId}-code`}
            className="mb-1.5 block text-sm font-medium text-heading"
          >
            קוד הגיפט קארד
          </label>
          <input
            id={`${baseId}-code`}
            name="code"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={19}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            dir="ltr"
            className={`${fieldClass} text-start font-mono tracking-widest`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {signedIn ? (
            <button
              type="submit"
              formAction={redeemAction}
              disabled={pending}
              className={buttonClass}
            >
              {redeemPending ? 'ממיר לארנק...' : 'מימוש לארנק'}
            </button>
          ) : (
            <Link
              href="/login?next=/gift-card"
              className={`${buttonClass} inline-flex items-center`}
            >
              התחברות למימוש
            </Link>
          )}
          <button
            type="submit"
            formAction={balanceAction}
            disabled={pending}
            className="min-h-11 rounded-lg border border-border bg-white px-5 text-sm font-semibold text-heading disabled:opacity-60"
          >
            {balancePending ? 'בודק...' : 'בדיקת יתרה'}
          </button>
        </div>
      </form>

      {balance.error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {balance.error}
        </p>
      )}
      {redeem.error && !redeem.needsLogin && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {redeem.error}
        </p>
      )}
      <BalanceResult state={balance} />
    </div>
  )
}
