'use client'

import {
  type GiftCardBalanceState,
  type GiftCardRedeemState,
  checkGiftCardBalance,
  redeemGiftCard,
} from '@/server/actions/gift-cards'
import Link from 'next/link'
import { useActionState, useEffect, useId, useRef } from 'react'

/**
 * Roughly a code: sixteen letters and digits, with or without the dashes.
 * Only decides whether a URL fragment is worth typing into the field. The
 * real check is the server's (`isWellFormedGiftCardCode`), which lives in a
 * module that imports `node:crypto` and so cannot be loaded here.
 */
const CODE_SHAPE = /^[A-Za-z0-9]{4}(-?[A-Za-z0-9]{4}){3}$/

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
        <p className="mt-1 text-heading/75">בתוקף עד {expiry}.</p>
      )}
      {state.qrDataUrl && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-heading/80">
            רוצים לתת את הכרטיס במתנה? סריקת הקוד פותחת את דף המימוש עם הקוד כבר מוקלד.
          </p>
          <img
            src={state.qrDataUrl}
            alt="קוד QR למימוש הגיפט קארד"
            width={200}
            height={200}
            className="mt-3"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-heading print:hidden"
          >
            הדפסה
          </button>
          <p className="mt-2 text-xs text-heading/75">
            מי שמחזיק בקוד יכול לממש אותו. שמרו על הדף המודפס כמו על כסף מזומן.
          </p>
        </div>
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

  // A printed card's QR opens this page as `/gift-card#CODE`. The fragment
  // never reaches the server (see lib/gift-cards/qr.ts), so it is read here,
  // typed into the field, and then removed from the address bar so the code
  // does not sit in the history entry or get copied with the link.
  const codeInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    if (!CODE_SHAPE.test(fromHash) || !codeInput.current) return
    codeInput.current.value = fromHash
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

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
            ref={codeInput}
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
