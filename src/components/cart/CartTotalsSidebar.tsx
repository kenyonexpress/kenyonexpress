'use client'

import type { CartView } from '@/lib/cart/types'
import { t } from '@/lib/i18n/messages'
import { shekelsRounded } from '@/lib/money-format'
import type { ReactNode } from 'react'

/**
 * Electro's `.cart_totals`: an h2, a two-column table of label and amount with
 * a rule under every row, then the proceed-to-checkout button. The coupon form
 * moved out to the table's actions row, which is where Electro keeps it.
 *
 * Amounts are whole shekels. The agorot stay integer in the cart view and the
 * checkout reprices on the server, so rounding here changes nothing charged.
 */
export default function CartTotalsSidebar({
  cart,
  checkout,
}: {
  cart: CartView
  checkout?: ReactNode
}) {
  return (
    <aside className="cart-totals" aria-labelledby="cart-totals-heading">
      <h2 id="cart-totals-heading" className="cart-totals__title">
        סיכום הזמנה
      </h2>

      <table className="cart-totals__table">
        <tbody>
          <tr>
            <th scope="row">
              {t('cartPage.subtotal')} ({cart.item_count})
            </th>
            <td className="tabular-nums">{shekelsRounded(cart.subtotal)}</td>
          </tr>

          {/* platform_fee and supplier_due are deliberately NOT rendered. They
              are the split of this sale between us and the supplier, an
              internal agreement that changes nothing about what the customer
              pays. The balance below is different: the customer really does
              pay it, in cash at the business, so hiding it would understate
              what the coupon costs them. */}
          {cart.balance_due_at_business > 0 && (
            <tr className="cart-totals__row--muted">
              <th scope="row">יתרה לתשלום בחנות</th>
              <td className="tabular-nums">{shekelsRounded(cart.balance_due_at_business)}</td>
            </tr>
          )}

          {cart.coupon && (
            <tr className="cart-totals__row--discount">
              <th scope="row">הנחה ({cart.coupon.code})</th>
              <td className="tabular-nums">-{shekelsRounded(cart.discount)}</td>
            </tr>
          )}

          <tr className="cart-totals__row--total">
            <th scope="row">לתשלום באתר</th>
            <td className="tabular-nums">
              <strong>{shekelsRounded(cart.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {checkout && <div className="cart-totals__proceed">{checkout}</div>}

      <p className="cart-totals__note">המחירים מחושבים בזמן אמת ועשויים להשתנות לפני התשלום</p>
    </aside>
  )
}
