'use client'

import CartCouponForm from '@/components/cart/CartCouponForm'
import type { CartView } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'

export default function CartTotalsSidebar({ cart }: { cart: CartView }) {
  return (
    <aside className="cart-sidebar" aria-labelledby="cart-totals-heading">
      <h2 id="cart-totals-heading" className="cart-sidebar__title">
        סיכום הזמנה
      </h2>

      <dl className="cart-sidebar__rows">
        <div className="cart-sidebar__row">
          <dt>פריטים ({cart.item_count})</dt>
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

        {cart.coupon && (
          <div className="cart-sidebar__row cart-sidebar__row--discount">
            <dt>הנחה ({cart.coupon.code})</dt>
            <dd className="tabular-nums">-{shekels(cart.discount)}</dd>
          </div>
        )}
      </dl>

      <CartCouponForm coupon={cart.coupon} />

      <div className="cart-sidebar__total">
        <span>לתשלום באתר</span>
        <strong className="tabular-nums">{shekels(cart.total)}</strong>
      </div>

      <p className="cart-sidebar__note">המחירים מחושבים בזמן אמת ועשויים להשתנות לפני התשלום</p>
    </aside>
  )
}
