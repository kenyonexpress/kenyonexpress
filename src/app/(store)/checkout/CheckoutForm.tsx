'use client'

import { track } from '@/lib/analytics/tracker'
import type { CartView } from '@/lib/cart/types'
import { type CheckoutFormState, submitCheckout } from '@/server/actions/payments/checkout'
import { useActionState, useEffect, useState } from 'react'

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export type CheckoutAddressPrefill = {
  id: string | null
  full_name: string
  phone: string
  city: string
  street: string
  street_number: string
  apartment: string
  zip: string
}

export type CheckoutSavedCard = {
  id: string
  last4: string | null
  brand: string | null
  isDefault: boolean
}

export default function CheckoutForm({
  cart,
  clientRef,
  needsAddress,
  address,
  walletBalance,
  savedCards = [],
}: {
  cart: CartView
  clientRef: string
  needsAddress: boolean
  address: CheckoutAddressPrefill
  walletBalance: number
  savedCards?: CheckoutSavedCard[]
}) {
  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    submitCheckout,
    null,
  )

  // Default to the saved card when there is one: it is the faster path and the
  // one the shopper asked for by saving it. 'new' always stays available.
  const [paymentChoice, setPaymentChoice] = useState<string>(
    savedCards.find((card) => card.isDefault)?.id ?? savedCards[0]?.id ?? 'new',
  )
  const usingSavedCard = paymentChoice !== 'new'

  const balanceAtBusiness = cart.balance_due_at_business

  // Checkout funnel steps. This is a single-page checkout, so the steps are the
  // sections a shopper actually has to clear: they are here (identity), they
  // need to supply a shipping address (address), and they pressed pay
  // (payment_redirect). Together with begin_checkout (emitted server-side once
  // an order row exists) this separates "never started" from "started and
  // dropped before an order existed".
  useEffect(() => {
    track('checkout_step', { step: 'identity' })
    if (needsAddress) track('checkout_step', { step: 'address' })
  }, [needsAddress])

  return (
    <form
      action={formAction}
      onSubmit={() => track('checkout_step', { step: 'payment_redirect' })}
      className="checkout-page__grid"
    >
      <input type="hidden" name="client_ref" value={clientRef} />
      <input type="hidden" name="needs_address" value={needsAddress ? 'true' : 'false'} />

      <div>
        <section className="checkout-section" aria-label="פריטי ההזמנה">
          <h2 className="checkout-section__title">פריטי ההזמנה</h2>
          {cart.items.map((item) => (
            <div className="checkout-item" key={`${item.product_id}::${item.variant_id ?? 'null'}`}>
              <div>
                <div className="checkout-item__name">
                  {item.name_he} × {item.quantity}
                </div>
                {item.type === 'coupon' && item.balance_due_at_business > 0 && (
                  <div className="checkout-item__meta">
                    תשלום באתר: {shekels(item.customer_pays_now)} · יתרה בעסק:{' '}
                    {shekels(item.balance_due_at_business)}
                  </div>
                )}
              </div>
              <span className="checkout-item__total">{shekels(item.customer_pays_now)}</span>
            </div>
          ))}
        </section>

        {needsAddress && (
          <section className="checkout-section" aria-label="כתובת למשלוח">
            <h2 className="checkout-section__title">כתובת למשלוח</h2>
            {address.id && <input type="hidden" name="address_id" value={address.id} />}
            {!address.id && (
              <>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-full-name">שם מלא</label>
                    <input
                      id="co-full-name"
                      name="full_name"
                      defaultValue={address.full_name}
                      required
                    />
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-phone">טלפון</label>
                    <input
                      id="co-phone"
                      name="phone"
                      defaultValue={address.phone}
                      inputMode="tel"
                      placeholder="05XXXXXXXX"
                    />
                  </div>
                </div>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-city">עיר</label>
                    <input id="co-city" name="city" defaultValue={address.city} required />
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-street">רחוב</label>
                    <input id="co-street" name="street" defaultValue={address.street} required />
                  </div>
                </div>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-number">מספר בית</label>
                    <input
                      id="co-number"
                      name="street_number"
                      defaultValue={address.street_number}
                      required
                    />
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-apartment">דירה</label>
                    <input id="co-apartment" name="apartment" defaultValue={address.apartment} />
                  </div>
                </div>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-zip">מיקוד</label>
                    <input id="co-zip" name="zip" defaultValue={address.zip} />
                  </div>
                </div>
              </>
            )}
            {address.id && (
              <p>
                {address.full_name}, {address.street} {address.street_number}, {address.city}
              </p>
            )}
          </section>
        )}
      </div>

      <aside>
        <section className="checkout-section" aria-label="סיכום תשלום">
          <h2 className="checkout-section__title">סיכום תשלום</h2>

          <div className="checkout-summary-row">
            <span>שווי הזמנה</span>
            <span>{shekels(cart.items.reduce((sum, item) => sum + item.line_total, 0))}</span>
          </div>
          {balanceAtBusiness > 0 && (
            <div className="checkout-summary-row checkout-summary-row--muted">
              <span>יתרה לתשלום בעסק (בקופון)</span>
              <span>{shekels(balanceAtBusiness)}</span>
            </div>
          )}

          {walletBalance > 0 && (
            <div className="checkout-field" style={{ marginTop: 10 }}>
              <label htmlFor="co-wallet">שימוש ביתרת ארנק (זמין: {shekels(walletBalance)})</label>
              <input
                id="co-wallet"
                name="apply_wallet_ils"
                type="number"
                inputMode="decimal"
                min={0}
                max={Math.min(walletBalance, cart.subtotal)}
                step="0.01"
                defaultValue={0}
              />
            </div>
          )}

          <div className="checkout-summary-total">
            <span>לתשלום באתר</span>
            <span>{shekels(cart.subtotal)}</span>
          </div>

          <label className="checkout-terms">
            <input type="checkbox" name="accept_terms" required />
            <span>קראתי ואני מאשר את התקנון ומדיניות הביטולים</span>
          </label>

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

          {/* Charging a saved token cannot mint a new one, so the option is
              hidden rather than shown as a checkbox that would do nothing. */}
          {!usingSavedCard && (
            <label className="checkout-terms">
              <input type="checkbox" name="save_card" defaultChecked />
              <span>שמירת כרטיס לתשלום מהיר בפעם הבאה</span>
            </label>
          )}

          {state?.error && <div className="checkout-error">{state.error}</div>}

          <button type="submit" className="checkout-pay-btn" disabled={isPending}>
            {isPending
              ? usingSavedCard
                ? 'מחייב את הכרטיס השמור...'
                : 'מעביר לדף תשלום מאובטח...'
              : usingSavedCard
                ? 'שלם עם הכרטיס השמור'
                : 'מעבר לתשלום מאובטח'}
          </button>
        </section>
      </aside>
    </form>
  )
}
