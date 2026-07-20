'use client'

import type { CartView } from '@/lib/cart/types'

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

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

        {cart.platform_fee > 0 && (
          <div className="cart-sidebar__row">
            <dt>עמלת פלטפורמה</dt>
            <dd className="tabular-nums">{shekels(cart.platform_fee)}</dd>
          </div>
        )}

        {cart.supplier_due > 0 && (
          <div className="cart-sidebar__row">
            <dt>לתשלום לספק</dt>
            <dd className="tabular-nums">{shekels(cart.supplier_due)}</dd>
          </div>
        )}

        {cart.balance_due_at_business > 0 && (
          <div className="cart-sidebar__row cart-sidebar__row--muted">
            <dt>יתרה לתשלום בחנות</dt>
            <dd className="tabular-nums">{shekels(cart.balance_due_at_business)}</dd>
          </div>
        )}
      </dl>

      <div className="cart-sidebar__total">
        <span>לתשלום באתר</span>
        <strong className="tabular-nums">{shekels(cart.subtotal)}</strong>
      </div>

      <p className="cart-sidebar__note">המחירים מחושבים בזמן אמת ועשויים להשתנות לפני התשלום</p>
    </aside>
  )
}
