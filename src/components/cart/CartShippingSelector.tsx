'use client'

import { useCart } from '@/components/cart/CartProvider'
import type { CartShipping } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { SHIPPING_METHODS, type ShippingMethodId } from '@/lib/shipping/methods'
import { useId } from 'react'

/**
 * The shipping method radiogroup in the cart's order summary.
 *
 * Renders only when the cart has a `shipping` block, which the pricer produces
 * for a cart with at least one physical line: a coupon is redeemed at the
 * business, so a coupon-only cart is asked nothing.
 *
 * The checked option is READ FROM THE STORE, never held in local state. The
 * store applies the pick optimistically, so the radio moves on the press; if
 * the server refuses, `settle(null, rollback)` restores the previous cart and
 * the radio moves back on its own. Local state here would leave a checked
 * option the cart does not hold, which is the shape of bug the store's
 * `addToCart` boolean exists to prevent.
 *
 * A native `<input type="radio">` per option and not a styled div: the group
 * gets arrow-key navigation, one tab stop and a screen-reader count for free,
 * and the RTL order is the DOM order.
 */
export default function CartShippingSelector({ shipping }: { shipping: CartShipping }) {
  const { setShippingMethod, isPending } = useCart()
  const groupId = useId()
  const name = `cart-shipping-${groupId}`

  const pick = (methodId: ShippingMethodId) => {
    if (methodId === shipping.method) return
    void setShippingMethod(methodId)
  }

  return (
    <fieldset className="cart-shipping" disabled={isPending}>
      <legend className="cart-shipping__legend">אופן המשלוח</legend>
      <div className="cart-shipping__options" role="presentation">
        {SHIPPING_METHODS.map((method) => {
          const id = `${name}-${method.id}`
          const checked = method.id === shipping.method
          return (
            <label
              key={method.id}
              htmlFor={id}
              className="cart-shipping__option"
              data-checked={checked ? '' : undefined}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={method.id}
                checked={checked}
                onChange={() => pick(method.id)}
                className="cart-shipping__input"
              />
              <span className="cart-shipping__text">
                <span className="cart-shipping__label">{method.label}</span>
                <span className="cart-shipping__description">{method.description}</span>
              </span>
              <span className="cart-shipping__cost tabular-nums">
                {method.costAgorot === 0 ? 'חינם' : shekels(method.costAgorot)}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
