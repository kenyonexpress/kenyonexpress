'use client'

import { isWellFormedGiftCardCode } from '@/lib/gift-cards/code'
import { agorot, formatAgorot } from '@/lib/money'
import { type GiftCardRedeemState, redeemGiftCard } from '@/server/actions/gift-cards'
import { useId, useState, useTransition } from 'react'

/**
 * The gift card code field on the checkout (STEP 48).
 *
 * It lives INSIDE the checkout form's markup and is deliberately not a form
 * of its own: nesting one is invalid HTML, and a `formAction` button would
 * post the whole address payload to the redemption. The input carries no
 * `name`, so the checkout submit never sees it; the button is `type="button"`
 * and calls the server action directly; Enter inside the field is caught so
 * it redeems instead of paying.
 *
 * Redemption is the same `redeemGiftCard` verb as /gift-card (session, per
 * user rate limit, `redeem_gift_card` under the row lock). On success the
 * parent re-seeds the wallet box with the new balance, which is how the card
 * pays for this order: there is no second stored-value spend path (234).
 */
export default function CheckoutGiftCardField({
  isAuthenticated,
  onCredited,
}: {
  isAuthenticated: boolean
  /** Integer agorot credited to the wallet by a successful redemption. */
  onCredited: (creditedAgorot: number) => void
}) {
  const baseId = useId()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<GiftCardRedeemState | null>(null)
  const [pending, startTransition] = useTransition()

  if (!isAuthenticated) {
    return (
      <p className="checkout-field__hint" data-testid="gift-card-login-hint">
        יש לכם גיפט קארד? אחרי ההתחברות בלחיצה על התשלום אפשר להזין כאן את הקוד.
      </p>
    )
  }

  const ready = isWellFormedGiftCardCode(code) && !pending

  const submit = () => {
    if (!ready) return
    const formData = new FormData()
    formData.set('code', code)
    startTransition(async () => {
      const next = await redeemGiftCard({ ok: false }, formData)
      setResult(next)
      if (next.ok) {
        onCredited(next.creditedAgorot ?? 0)
        setCode('')
      }
    })
  }

  return (
    <div className="checkout-wallet" data-testid="checkout-gift-card">
      <label htmlFor={`${baseId}-code`}>יש לכם גיפט קארד? הקוד מהמייל, והסכום ייטען לארנק</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${baseId}-code`}
          type="text"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          maxLength={19}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          className="flex-1 text-start font-mono tracking-widest"
          aria-describedby={result?.error ? `${baseId}-error` : undefined}
        />
        <button
          type="button"
          className="checkout-error__retry"
          onClick={submit}
          disabled={!ready}
          data-testid="gift-card-redeem"
        >
          {pending ? 'ממיר לארנק...' : 'מימוש גיפט קארד'}
        </button>
      </div>
      {result && !result.ok && result.error && (
        <p id={`${baseId}-error`} role="alert" className="checkout-error">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <output className="checkout-wallet-note" data-testid="gift-card-credited">
          הגיפט קארד מומש: {formatAgorot(agorot(result.creditedAgorot ?? 0))} נטענו לארנק והוחלו על
          ההזמנה.
        </output>
      )}
    </div>
  )
}
