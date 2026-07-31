'use client'

import { track } from '@/lib/analytics/tracker'
import { shekels } from '@/lib/cart/format'
import type { CartView } from '@/lib/cart/types'
import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import { type Agorot, parseIls, sumAgorot } from '@/lib/money'
import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import { type CheckoutFormState, submitCheckout } from '@/server/actions/payments/checkout'
import { useActionState, useEffect, useRef, useState } from 'react'

export type CheckoutAddressPrefill = {
  id: string | null
  full_name: string
  phone: string
  city: string
  street: string
  street_number: string
  apartment: string
  floor: string
  zip: string
  email: string
}

export type CheckoutSavedCard = {
  id: string
  last4: string | null
  brand: string | null
  isDefault: boolean
}

// What a guest typed before being sent to Google. Kept in sessionStorage rather
// than posted anywhere: it is the shopper's own address, it never needs to
// leave the tab, and sessionStorage dies with the tab. Without it the OAuth
// round trip returns to an empty form and the shopper retypes an address they
// already gave, which is the usual reason a guest checkout is abandoned at the
// login step.
const RESUME_KEY = 'ke.checkout.resume'
const RESUME_FIELDS = [
  'first_name',
  'last_name',
  'city',
  'street',
  'street_number',
  'apartment',
  'floor',
  'zip',
  'phone',
  'email',
  'order_notes',
] as const

function readResume(): Partial<Record<(typeof RESUME_FIELDS)[number], string>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export default function CheckoutForm({
  cart,
  clientRef,
  needsAddress,
  address,
  walletBalance,
  savedCards = [],
  isAuthenticated,
  resuming = false,
}: {
  cart: CartView
  clientRef: string
  needsAddress: boolean
  address: CheckoutAddressPrefill
  walletBalance: number
  savedCards?: CheckoutSavedCard[]
  isAuthenticated: boolean
  /** True when we are back from Google and the form should refill itself. */
  resuming?: boolean
}) {
  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    submitCheckout,
    null,
  )
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )

  const formRef = useRef<HTMLFormElement>(null)
  const googleFormRef = useRef<HTMLFormElement>(null)

  const [paymentChoice, setPaymentChoice] = useState<string>(
    savedCards.find((card) => card.isDefault)?.id ?? savedCards[0]?.id ?? 'new',
  )
  const usingSavedCard = paymentChoice !== 'new'
  const [zipError, setZipError] = useState<string | null>(null)

  const balanceAtBusiness = cart.balance_due_at_business
  const itemsTotal = sumAgorot(cart.items.map((item) => item.line_total))

  // `walletBalance` and the `apply_wallet_ils` field are the one place on this
  // page still denominated in shekels: the wallet column is `balance_ils` and
  // the server action parses the field back out in shekels. It is lifted to
  // agorot here so the cap below compares like with like. Comparing the raw
  // shekel balance against the agorot subtotal would have offered a wallet
  // ceiling a hundred times the cart.
  const walletBalanceAgorot: Agorot = parseIls(walletBalance.toFixed(2))
  const walletMaxIls = Math.min(walletBalanceAgorot, cart.subtotal) / 100

  const [firstName, ...restName] = (address.full_name ?? '').split(' ')
  const prefill = {
    first_name: firstName ?? '',
    last_name: restName.join(' '),
    city: address.city,
    street: address.street,
    street_number: address.street_number,
    apartment: address.apartment,
    floor: address.floor,
    zip: address.zip,
    phone: address.phone,
    email: address.email,
    order_notes: '',
  }

  useEffect(() => {
    track('checkout_step', { step: 'identity' })
    if (needsAddress) track('checkout_step', { step: 'address' })
  }, [needsAddress])

  // Refill after the Google round trip. Done in an effect against the live DOM
  // rather than through defaultValue, because the values are only readable on
  // the client and a defaultValue read during render would differ between the
  // server and client passes.
  useEffect(() => {
    if (!resuming) return
    const saved = readResume()
    const form = formRef.current
    if (!form) return
    for (const name of RESUME_FIELDS) {
      const value = saved[name]
      if (!value) continue
      const field = form.elements.namedItem(name)
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        if (!field.value) field.value = value
      }
    }
    window.sessionStorage.removeItem(RESUME_KEY)
  }, [resuming])

  const validateZip = (value: string): boolean => {
    const check = checkOptionalIsraeliPostalCode(value)
    setZipError(check && !check.ok ? check.message : null)
    return !check || check.ok
  }

  // The single gate that makes this a guest checkout: the form is filled, and
  // only the press of "pay" needs an identity. A guest is stashed and sent to
  // Google here instead of being turned away at the door.
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget
    const zip = (form.elements.namedItem('zip') as HTMLInputElement | null)?.value ?? ''
    if (!validateZip(zip)) {
      event.preventDefault()
      return
    }

    if (!isAuthenticated) {
      event.preventDefault()
      const data = new FormData(form)
      const stash: Record<string, string> = {}
      for (const name of RESUME_FIELDS) {
        const value = data.get(name)
        if (typeof value === 'string' && value !== '') stash[name] = value
      }
      try {
        window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(stash))
      } catch {
        // A blocked sessionStorage costs the refill, not the checkout.
      }
      track('checkout_step', { step: 'guest_login' })
      googleFormRef.current?.requestSubmit()
      return
    }

    track('checkout_step', { step: 'payment_redirect' })
  }

  const authError = googleState && 'error' in googleState ? googleState.error : null
  const formError = state && 'error' in state ? state.error : null
  // The hosted payment page, once beginCheckout has created it. Its presence is
  // what switches the page from "filling in a form" to "paying".
  const frame = state && 'frame' in state ? state.frame : null
  const busy = isPending || googlePending

  return (
    <>
      {!isAuthenticated && (
        <div className="checkout-guest-notice">
          <span>קונית כאן בעבר?</span>
          <button
            type="button"
            className="checkout-guest-notice__link"
            onClick={() => googleFormRef.current?.requestSubmit()}
            disabled={googlePending}
          >
            {googlePending ? 'מעביר להתחברות...' : 'יש ללחוץ כאן כדי להתחבר'}
          </button>
        </div>
      )}

      {/* Its own form: nesting it inside the checkout form is invalid HTML and
          would make the OAuth submit carry the whole address payload. */}
      <form action={googleAction} ref={googleFormRef} hidden>
        <input type="hidden" name="next" value="/checkout?resume=1" />
      </form>

      <form
        action={formAction}
        onSubmit={handleSubmit}
        ref={formRef}
        className="checkout-page__grid"
        noValidate
      >
        <input type="hidden" name="client_ref" value={clientRef} />
        <input type="hidden" name="needs_address" value={needsAddress ? 'true' : 'false'} />
        {address.id && <input type="hidden" name="address_id" value={address.id} />}

        <div className="checkout-col-main">
          <section className="checkout-section" aria-label="פרטי חיוב">
            <h2 className="checkout-section__title">
              <span>פרטי חיוב</span>
            </h2>

            {address.id ? (
              <p>
                {address.full_name}, {address.street} {address.street_number}, {address.city}
              </p>
            ) : (
              <>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-first-name">
                      שם פרטי <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-first-name"
                      name="first_name"
                      defaultValue={prefill.first_name}
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-last-name">
                      שם משפחה <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-last-name"
                      name="last_name"
                      defaultValue={prefill.last_name}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className="checkout-fields-row checkout-fields-row--single">
                  <div className="checkout-field">
                    <label htmlFor="co-city">
                      עיר <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-city"
                      name="city"
                      defaultValue={prefill.city}
                      autoComplete="address-level2"
                      required
                    />
                  </div>
                </div>

                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-street">
                      רחוב <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-street"
                      name="street"
                      defaultValue={prefill.street}
                      autoComplete="address-line1"
                      required
                    />
                  </div>
                  <div />
                </div>

                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-apartment">מספר דירה (אופציונלי)</label>
                    <input
                      id="co-apartment"
                      name="apartment"
                      defaultValue={prefill.apartment}
                      autoComplete="address-line2"
                    />
                  </div>
                  <div />
                </div>

                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-zip">מיקוד / תא דואר (אופציונלי)</label>
                    <input
                      id="co-zip"
                      name="zip"
                      defaultValue={prefill.zip}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      aria-invalid={zipError ? 'true' : undefined}
                      aria-describedby={zipError ? 'co-zip-error' : undefined}
                      onBlur={(event) => validateZip(event.currentTarget.value)}
                    />
                    {zipError && (
                      <span className="checkout-field__error" id="co-zip-error" role="alert">
                        {zipError}
                      </span>
                    )}
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-floor">קומה (אופציונלי)</label>
                    <input id="co-floor" name="floor" defaultValue={prefill.floor} />
                  </div>
                </div>

                <div className="checkout-fields-row checkout-fields-row--single">
                  <div className="checkout-field">
                    <label htmlFor="co-number">
                      מספר בית <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-number"
                      name="street_number"
                      defaultValue={prefill.street_number}
                      required
                    />
                  </div>
                </div>

                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-phone">
                      טלפון <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-phone"
                      name="phone"
                      defaultValue={prefill.phone}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="05XXXXXXXX"
                      required
                    />
                  </div>
                  <div />
                </div>

                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-email">
                      כתובת אימייל <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-email"
                      name="email"
                      type="email"
                      defaultValue={prefill.email}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div />
                </div>
              </>
            )}
          </section>

          <section className="checkout-section" aria-label="מידע נוסף">
            <h2 className="checkout-section__title">
              <span>מידע נוסף</span>
            </h2>
            <div className="checkout-field">
              <label htmlFor="co-notes">הערות להזמנה (אופציונלי)</label>
              <textarea
                id="co-notes"
                name="order_notes"
                placeholder="הערות על ההזמנה, לדוגמה, הערות מיוחדות למסירה."
              />
            </div>
          </section>
        </div>

        <aside>
          <section className="checkout-review" aria-label="ההזמנה שלך">
            <h2 className="checkout-section__title">
              <span>ההזמנה שלך</span>
            </h2>

            <table className="checkout-review__table">
              <thead>
                <tr>
                  <th scope="col">מוצר</th>
                  <th scope="col">מחיר</th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((item) => (
                  <tr key={`${item.product_id}::${item.variant_id ?? 'null'}`}>
                    <td>
                      <span className="checkout-item__name">
                        {item.name_he} × {item.quantity}
                      </span>
                      {item.type === 'coupon' && item.balance_due_at_business > 0 && (
                        <span className="checkout-item__meta">
                          תשלום באתר: {shekels(item.customer_pays_now)} · יתרה בעסק:{' '}
                          {shekels(item.balance_due_at_business)}
                        </span>
                      )}
                    </td>
                    <td className="checkout-item__total">{shekels(item.customer_pays_now)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="checkout-review__row">
                  <th scope="row">מחיר</th>
                  <td>{shekels(itemsTotal)}</td>
                </tr>
                {balanceAtBusiness > 0 && (
                  <tr className="checkout-review__row checkout-review__row--muted">
                    <th scope="row">יתרה לתשלום בעסק (בקופון)</th>
                    <td>{shekels(balanceAtBusiness)}</td>
                  </tr>
                )}
                <tr className="checkout-review__row checkout-review__row--total">
                  <th scope="row">סה&quot;כ</th>
                  <td>{shekels(cart.subtotal)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="checkout-payment">
              <div className="checkout-payment__method">
                <input type="radio" checked readOnly id="co-pay-card" />
                <label htmlFor="co-pay-card">תשלום בעזרת כרטיס אשראי</label>
              </div>
              <p className="checkout-payment__note">תשלום מאובטח באשראי, באמצעות Cardcom.</p>

              {savedCards.length > 0 && (
                <fieldset className="checkout-cards">
                  <legend className="checkout-cards__legend">אמצעי תשלום</legend>
                  {savedCards.map((card) => (
                    <label className="checkout-cards__option" key={card.id}>
                      <input
                        type="radio"
                        name="token_id"
                        value={card.id}
                        checked={paymentChoice === card.id}
                        onChange={() => setPaymentChoice(card.id)}
                      />
                      <span>
                        {card.brand ?? 'כרטיס'} המסתיים ב-{card.last4 ?? '****'}
                      </span>
                    </label>
                  ))}
                  <label className="checkout-cards__option">
                    <input
                      type="radio"
                      name="token_id"
                      value="new"
                      checked={paymentChoice === 'new'}
                      onChange={() => setPaymentChoice('new')}
                    />
                    <span>כרטיס אחר</span>
                  </label>
                </fieldset>
              )}

              {walletBalance > 0 && (
                <div className="checkout-wallet">
                  <label htmlFor="co-wallet">
                    שימוש ביתרת ארנק (זמין: {shekels(walletBalanceAgorot)})
                  </label>
                  <input
                    id="co-wallet"
                    name="apply_wallet_ils"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={walletMaxIls}
                    step="0.01"
                    defaultValue={0}
                  />
                </div>
              )}

              <p className="checkout-privacy">
                הפרטים האישיים ישמשו לצורך ביצוע הרכישה, ולא יועברו לגורם שאינו מורשה בהתאם למדיניות
                הפרטיות.
              </p>

              <label className="checkout-terms">
                <input type="checkbox" name="accept_terms" required />
                <span>
                  קראתי ואני מסכים לאתר תנאי שימוש{' '}
                  <span className="checkout-field__required">*</span>
                </span>
              </label>

              {!usingSavedCard && (
                <label className="checkout-terms">
                  <input type="checkbox" name="save_card" defaultChecked />
                  <span>שמירת כרטיס לתשלום מהיר בפעם הבאה</span>
                </label>
              )}

              {formError && <div className="checkout-error">{formError}</div>}
              {authError && <div className="checkout-error">{authError}</div>}

              <button type="submit" className="checkout-pay-btn" disabled={busy}>
                {busy
                  ? googlePending
                    ? 'מעביר להתחברות...'
                    : usingSavedCard
                      ? 'מחייב את הכרטיס השמור...'
                      : 'מעביר לדף תשלום מאובטח...'
                  : 'שליחת הזמנה'}
              </button>
            </div>
          </section>
        </aside>
      </form>

      {frame && (
        <section className="checkout-frame" aria-label="תשלום מאובטח">
          <div className="checkout-frame__head">
            <span className="checkout-frame__title">תשלום מאובטח</span>
            <span className="checkout-frame__order">הזמנה {frame.orderId.slice(0, 8)}</span>
          </div>
          {/*
            The payment page runs here rather than in place of the site. When it
            finishes, Cardcom navigates THIS iframe to /checkout/return, and
            PaymentFrameBreakout on that page moves the top window to itself —
            which is why lib/security/frame-policy.ts relaxes frame-ancestors to
            'self' on that one path and nowhere else.
          */}
          <iframe
            src={frame.url}
            title="דף תשלום מאובטח של Cardcom"
            className="checkout-frame__iframe"
            // The payment page needs scripts and same-origin storage against
            // its OWN origin. allow-same-origin is granted without
            // allow-top-navigation, so the framed page can work but cannot
            // move the tab out from under the shopper on its own.
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          />
          <p className="checkout-frame__note">
            החיוב מתבצע מול Cardcom. אל תסגור את החלון עד לסיום התשלום.
          </p>
        </section>
      )}
    </>
  )
}
