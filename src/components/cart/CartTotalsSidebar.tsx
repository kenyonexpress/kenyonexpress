'use client'

import CartCouponForm from '@/components/cart/CartCouponForm'
import CartDeliveryEstimate from '@/components/cart/CartDeliveryEstimate'
import CartShippingSelector from '@/components/cart/CartShippingSelector'
import type { CartView } from '@/lib/cart/types'
import { sumAgorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { useEffect, useRef, useState } from 'react'

/**
 * Everything the summary takes off the on-site charge, as one figure: the
 * coupon's discount and every completed bundle's. Integer agorot through
 * `sumAgorot`, like every other sum on this page. Zero is the ordinary state
 * and the row that shows it is not rendered then.
 */
export function cartSavings(cart: Pick<CartView, 'discount' | 'bundle_discount'>) {
  return sumAgorot([cart.discount, cart.bundle_discount])
}

/**
 * What the whole purchase costs the shopper, on the site and at the business
 * together. Only different from `total` when a coupon line carries a balance
 * due in the store, which is the one case where the on-site total understates
 * the price of what is in the cart.
 */
export function cartGrandTotal(cart: Pick<CartView, 'total' | 'balance_due_at_business'>) {
  return sumAgorot([cart.total, cart.balance_due_at_business])
}

/** "3 מוצרים, 7 יחידות": only worth saying when the two numbers differ. */
export function itemsNote(lines: number, units: number): string | null {
  if (lines === units) return null
  const products = lines === 1 ? 'מוצר אחד' : `${lines} מוצרים`
  return `${products}, ${units} יחידות`
}

/** True for one render cycle after `value` moved; drives the pulse. */
function useChanged(value: number): boolean {
  const [changed, setChanged] = useState(false)
  const previous = useRef(value)
  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    setChanged(true)
    const timer = setTimeout(() => setChanged(false), 600)
    return () => clearTimeout(timer)
  }, [value])
  return changed
}

export default function CartTotalsSidebar({ cart }: { cart: CartView }) {
  const savings = cartSavings(cart)
  const grand = cartGrandTotal(cart)
  const note = itemsNote(cart.items.length, cart.item_count)
  const totalPulse = useChanged(cart.total)
  // One line at one unit is its own breakdown; the list earns its place once
  // there is something to add up.
  const showBreakdown = cart.items.length > 1 || cart.item_count > 1

  return (
    <aside className="cart-sidebar" aria-labelledby="cart-totals-heading">
      <h2 id="cart-totals-heading" className="cart-sidebar__title">
        סיכום הזמנה
      </h2>

      <dl className="cart-sidebar__rows">
        <div className="cart-sidebar__row">
          <dt>
            פריטים ({cart.item_count})
            {note && <span className="cart-sidebar__row-note">{note}</span>}
          </dt>
          <dd className="tabular-nums">{shekels(cart.subtotal)}</dd>
        </div>

        {/* platform_fee and supplier_due are deliberately NOT rendered. They are
            the split of this sale between us and the supplier, an internal
            agreement that changes nothing about what the customer pays, and
            showing a shopper "platform commission ₪X" invites the reasonable
            question of why they are being charged it. They stay on the admin
            screens, where the audience is the party to that agreement. The
            balance below is different: the customer really does pay it, in cash
            at the business, so hiding it would understate what the coupon
            costs them. */}
        {cart.balance_due_at_business > 0 && (
          <div className="cart-sidebar__row cart-sidebar__row--muted">
            <dt>יתרה לתשלום בחנות</dt>
            <dd className="tabular-nums">{shekels(cart.balance_due_at_business)}</dd>
          </div>
        )}

        {/* One row per completed bundle (STEP 60), named so the shopper can
            tell which set earned it. The amount is the server's, after the
            caps, and it is what the checkout will take off the card. */}
        {(cart.bundles ?? []).map((bundle) => (
          <div
            key={bundle.id}
            className="cart-sidebar__row cart-sidebar__row--discount"
            data-testid="cart-bundle-row"
          >
            <dt>
              חיסכון חבילה: {bundle.name_he}
              {bundle.times > 1 ? ` ×${bundle.times}` : ''}
            </dt>
            <dd className="tabular-nums">-{shekels(bundle.discount)}</dd>
          </div>
        ))}

        {cart.coupon && (
          <div className="cart-sidebar__row cart-sidebar__row--discount">
            <dt>הנחה ({cart.coupon.code})</dt>
            <dd className="tabular-nums">-{shekels(cart.discount)}</dd>
          </div>
        )}

        {/* The discounts added up, after they have each been named. Rendered
            only when there are at least two of them to add: one discount row
            followed by the same figure under "savings" is the same number
            read twice. */}
        {savings > 0 && (cart.bundles ?? []).length + (cart.coupon ? 1 : 0) > 1 && (
          <div
            className="cart-sidebar__row cart-sidebar__row--savings"
            data-testid="cart-savings-row"
          >
            <dt>סך החיסכון</dt>
            <dd className="tabular-nums">-{shekels(savings)}</dd>
          </div>
        )}

        {/* The shipping row is the chosen method's rate, "חינם" while every
            registered rate is zero. It is a row of the summary and not a note
            under the selector so a shopper adding up the column finds every
            term of the total in it. */}
        {cart.shipping && (
          <div className="cart-sidebar__row" data-testid="cart-shipping-row">
            <dt>משלוח ({cart.shipping.label})</dt>
            <dd className="tabular-nums">
              {cart.shipping.cost === 0 ? 'חינם' : shekels(cart.shipping.cost)}
            </dd>
          </div>
        )}
      </dl>

      {cart.shipping && <CartShippingSelector shipping={cart.shipping} />}
      {cart.shipping && <CartDeliveryEstimate shipping={cart.shipping} />}

      <CartCouponForm coupon={cart.coupon} />

      {/* The lines behind the subtotal, closed by default. On a phone the
          list of cards is a screen or two above this column; here the same
          figures sit next to the number they add up to. */}
      {showBreakdown && (
        <details className="cart-sidebar__breakdown" data-testid="cart-breakdown">
          <summary className="cart-sidebar__breakdown-summary">פירוט לפי מוצר</summary>
          <ul className="cart-sidebar__breakdown-list">
            {cart.items.map((item) => (
              <li
                key={`${item.product_id}::${item.variant_id ?? 'null'}`}
                className="cart-sidebar__breakdown-item"
              >
                <span className="cart-sidebar__breakdown-name">{item.name_he}</span>
                <span className="cart-sidebar__breakdown-calc tabular-nums">
                  {item.quantity} × {shekels(item.unit_price)}
                </span>
                <span className="cart-sidebar__breakdown-sum tabular-nums">
                  {shekels(item.line_total)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* aria-live on the figure, not the row: a quantity change elsewhere on
          the page is answered here, and the label beside it does not change. */}
      <div className="cart-sidebar__total">
        <span>לתשלום באתר</span>
        <strong className="tabular-nums" aria-live="polite" data-pulse={totalPulse || undefined}>
          {shekels(cart.total)}
        </strong>
      </div>

      {/* "חסכת": the one figure of the discount rows a shopper repeats to
          someone else. Under the total, where the number it qualifies is. */}
      {savings > 0 && (
        <p className="cart-sidebar__saved" data-testid="cart-saved-line">
          חסכת {shekels(savings)} בהזמנה זו
        </p>
      )}

      {/* The on-site figure plus the balance paid at the business: what the
          purchase costs altogether. Only when a balance exists, so the
          ordinary cart has one total and not two that agree. */}
      {cart.balance_due_at_business > 0 && (
        <p className="cart-sidebar__grand" data-testid="cart-grand-total">
          <span>סה״כ עלות הרכישה</span>
          <strong className="tabular-nums">{shekels(grand)}</strong>
          <span className="cart-sidebar__grand-note">
            כולל {shekels(cart.balance_due_at_business)} לתשלום בחנות בעת המימוש
          </span>
        </p>
      )}

      <p className="cart-sidebar__vat">המחירים כוללים מע״מ</p>

      {/* Under the total, not among the rows: it is not a term of what the
          card is charged. It is what comes back afterwards, and the engine's
          own number (`commission.cashbackAmount`), so what is promised here
          is what the ledger credits. Hidden at zero, the ordinary state. */}
      {cart.cashback > 0 && (
        <p className="cart-sidebar__cashback" data-testid="cart-cashback-row">
          <span>קאשבק צפוי לארנק</span>
          <strong className="tabular-nums">{shekels(cart.cashback)}</strong>
          <span className="cart-sidebar__cashback-note">יזוכה לאחר אספקה או מימוש</span>
        </p>
      )}

      {/* The real-time-pricing note moved below the checkout button
          (CartPageView): live's collaterals end at the total + button, and the
          disclaimer reads naturally under the CTA it qualifies. */}
    </aside>
  )
}
