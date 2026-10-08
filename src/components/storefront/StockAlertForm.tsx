'use client'

import { type StockAlertState, joinStockWaitlist } from '@/server/actions/stock-alerts'
import { useActionState, useId } from 'react'

const EMPTY: StockAlertState = { ok: false }

/**
 * "Tell me when it is back" (STEP 58), under a sold-out buy row.
 *
 * ONE FIELD, BECAUSE THE PAGE IS CACHED FOR EVERYONE. This component cannot
 * know whether the visitor is signed in without a per-session read that would
 * drag the product page out of its hour-long cache, so it always offers the
 * address field. The field is NOT required: a signed-in shopper may leave it
 * empty and the action uses the session's address; a guest who leaves it
 * empty gets the action's "נא למלא כתובת מייל" back. The address is Latin even
 * on a Hebrew page, so the FIELD is LTR while the row stays RTL.
 *
 * The honeypot follows ContactForm: offscreen, aria-hidden, tabIndex -1.
 * On success the form is replaced by one line, so a second press is
 * impossible from this render; the server would answer identically anyway.
 */
export default function StockAlertForm({
  productId,
  variantId,
}: {
  productId: string
  variantId: string | null
}) {
  const [state, action, pending] = useActionState(joinStockWaitlist, EMPTY)
  const id = useId()

  if (state.ok) {
    return (
      <output className="pdp-waitlist__done" aria-live="polite">
        {state.message}
      </output>
    )
  }

  return (
    <form action={action} className="pdp-waitlist" data-testid="stock-alert-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId ?? ''} />
      <div aria-hidden="true" className="honeypot-offscreen">
        <label htmlFor={`${id}-company`}>חברה</label>
        <input id={`${id}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label htmlFor={`${id}-email`} className="pdp-waitlist__label">
        עדכנו אותי כשהמוצר חוזר למלאי
      </label>
      <div className="pdp-waitlist__row">
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          dir="ltr"
          inputMode="email"
          autoComplete="email"
          placeholder="כתובת מייל"
          aria-describedby={state.error ? `${id}-error` : `${id}-note`}
          aria-invalid={state.error ? true : undefined}
          className="pdp-waitlist__email"
        />
        <button type="submit" disabled={pending} className="pdp-waitlist__submit">
          {pending ? 'שומר...' : 'עדכנו אותי'}
        </button>
      </div>
      {state.error ? (
        <p id={`${id}-error`} role="alert" className="pdp-waitlist__note">
          {state.error}
        </p>
      ) : (
        <p id={`${id}-note`} className="pdp-waitlist__note">
          מייל אחד בלבד, כשהמוצר חוזר. מחוברים יכולים להשאיר את השדה ריק.
        </p>
      )}
    </form>
  )
}
