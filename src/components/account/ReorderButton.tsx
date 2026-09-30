'use client'

import {
  type ReorderCard,
  describeCartReplacement,
  describeReorderCard,
  describeSkippedLines,
} from '@/lib/checkout/reorder'
import { type ReorderResult, reorderOneClick } from '@/server/actions/payments/reorder'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

/**
 * The one-click reorder button on a past order.
 *
 * With a saved card it is a single primary button: press it, the cart is
 * rebuilt and the card is charged server-to-server, and the browser lands on
 * the confirmation. The line under it says which card and what happens to the
 * cart already there, because a button that charges money must not surprise.
 *
 * Without a saved card it is the plain reorder: the same rebuild, then the
 * checkout page for the card. Same action, different promise on the label.
 *
 * `client_ref` is minted once per mount and reused. It is the key
 * `beginCheckout` replays on, so a second press while the first is in flight,
 * or a retry after a network error, returns the first attempt's outcome
 * instead of charging twice. `variant="compact"` is the list row: label only,
 * no explanatory line, since the row has no room and the detail page has both.
 */
export interface ReorderButtonProps {
  orderId: string
  card: ReorderCard | null
  cartItemCount: number
  paymentGateOpen: boolean
  variant?: 'full' | 'compact'
}

type Notice = { tone: 'error' | 'info'; text: string; toCheckout: boolean }

function noticeFor(result: ReorderResult): Notice | null {
  if (!result.ok) {
    return { tone: 'error', text: result.error, toCheckout: result.cartRebuilt }
  }
  if (result.kind === 'checkout') {
    const skipped = describeSkippedLines(result.skipped)
    const why =
      result.reason === 'no_card'
        ? 'העגלה מוכנה, נותר רק לבחור אמצעי תשלום בקופה'
        : 'העגלה מוכנה, נותר רק להשלים כתובת למשלוח בקופה'
    return { tone: 'info', text: skipped ? `${why}. ${skipped}` : why, toCheckout: true }
  }
  return null
}

export default function ReorderButton({
  orderId,
  card,
  cartItemCount,
  paymentGateOpen,
  variant = 'full',
}: ReorderButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const clientRef = useRef<string | null>(null)

  const oneClick = Boolean(card)
  const label = oneClick ? 'הזמנה חוזרת בלחיצה אחת' : 'להזמין שוב'
  const busyLabel = oneClick ? 'מחייב...' : 'בונה את העגלה...'

  function submit() {
    if (pending) return
    if (!clientRef.current) clientRef.current = crypto.randomUUID()
    const client_ref = clientRef.current
    setNotice(null)
    startTransition(async () => {
      let result: ReorderResult
      try {
        result = await reorderOneClick({ order_id: orderId, client_ref })
      } catch {
        // Retrying reuses the same client_ref, so a charge that did go
        // through behind the failed response replays as "paid".
        setNotice({
          tone: 'error',
          text: 'החיבור נכשל, נסו שוב. אם החיוב בוצע, ההזמנה תופיע ברשימה',
          toCheckout: false,
        })
        return
      }
      if (result.ok && result.kind === 'paid') {
        router.push(`/checkout/return?order_id=${encodeURIComponent(result.order_id)}`)
        return
      }
      if (result.ok && result.kind === 'challenge') {
        // The issuer wants a 3DS challenge, which only Cardcom's hosted page
        // can show. Top-level navigation, not an iframe: the return stub
        // breaks out to the top window anyway, and the account page has no
        // payment frame to host it in.
        window.location.assign(result.redirect_url)
        return
      }
      setNotice(noticeFor(result))
    })
  }

  const cardLine = card ? describeReorderCard(card) : null
  const replaceLine = describeCartReplacement(cartItemCount)

  return (
    <div className="account-reorder" data-variant={variant}>
      <button
        type="button"
        className={oneClick ? 'account-btn account-btn--primary' : 'account-btn'}
        onClick={submit}
        disabled={pending || !paymentGateOpen}
        aria-busy={pending}
        title={paymentGateOpen ? undefined : 'התשלום באתר מושבת כרגע'}
      >
        {pending ? busyLabel : label}
      </button>
      {variant === 'full' && (
        <p className="account-row__meta account-reorder__note">
          {cardLine ? `${cardLine}. ` : ''}
          {replaceLine ? `${replaceLine}. ` : ''}
          {oneClick ? 'בלחיצה אתם מאשרים את התקנון.' : 'הפריטים ייכנסו לעגלה ותועברו לקופה.'}
        </p>
      )}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`account-reorder__notice account-reorder__notice--${notice.tone}`}
        >
          {notice.text}
          {notice.toCheckout && (
            <>
              {' '}
              <a className="account-reorder__link" href="/checkout">
                המשך לקופה
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
