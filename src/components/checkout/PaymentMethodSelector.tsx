'use client'

import PaymentLogos from '@/components/layout/PaymentLogos'
import type { PaymentMethodOption } from '@/lib/checkout/payment-methods'

/**
 * The payment method, as a group of cards the shopper picks one of (UX17).
 *
 * One radio group under the name the server already reads, `token_id`: a
 * saved card's value is its token id, the hosted page's is 'new'. The radios
 * MUST be in the DOM to post, which is why the group is never swapped for a
 * sentence when there is one option: a guest sees the single card for the
 * hosted page, ticked, and the form still carries `token_id=new`.
 *
 * The brand marks sit next to the hosted-page card and not inside its label,
 * because a `<ul>` is not phrasing content and a label may hold nothing else.
 * They are the footer's own marks (components/layout/PaymentLogos), so the
 * checkout promises the same five brands the footer does.
 */
export default function PaymentMethodSelector({
  options,
  choice,
  onChange,
}: {
  options: readonly PaymentMethodOption[]
  /** The ticked option's id. */
  choice: string
  onChange: (id: string) => void
}) {
  return (
    <fieldset className="checkout-methods" data-testid="payment-methods">
      <legend className="checkout-methods__legend">אמצעי תשלום</legend>
      {options.map((option) => {
        const selected = choice === option.id
        return (
          <div
            key={option.id}
            className="checkout-methods__option"
            data-kind={option.kind}
            data-selected={selected ? 'true' : undefined}
          >
            <label className="checkout-methods__pick">
              <input
                type="radio"
                name="token_id"
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
              />
              <span className="checkout-methods__text">
                <span className="checkout-methods__label">
                  {option.label}
                  {option.isDefault && <span className="checkout-methods__badge">ברירת מחדל</span>}
                </span>
                <span className="checkout-methods__detail">{option.detail}</span>
              </span>
            </label>
            {option.kind === 'hosted-card' && <PaymentLogos className="checkout-methods__marks" />}
          </div>
        )
      })}
    </fieldset>
  )
}
