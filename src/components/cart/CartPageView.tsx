'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import CartLineItem, { CartEmptyState } from '@/components/cart/CartLineItem'
import { useCart, useCartAuth } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import Link from 'next/link'

/**
 * Takes no props, which is what makes /cart a prerendered page.
 *
 * It used to receive `initialCart` and `isAuthenticated` from a server
 * component that awaited `getCart()` and `auth.getUser()`, and then wrote the
 * cart into the store from an effect - the same store the layout's
 * `<CartBootstrap>` now fills, from the same two reads. Two servers reads for
 * one cart, and the page could not be static because of the second one.
 *
 * Reading both straight off the store deletes the duplicate and leaves this
 * whole route in the static shell.
 */
export default function CartPageView() {
  const { cart, clear, removeUnavailable, isPending } = useCart()
  const isAuthenticated = useCartAuth()

  const unavailableCount = cart.items.filter((item) => !item.available).length
  const hasUnavailable = unavailableCount > 0
  const isEmpty = cart.items.length === 0

  return (
    <div className="cart-page">
      {/* The h1 was hidden here on a claim that live has no visible heading.
          refs/ke_live_computed.json disagrees at all three widths: live draws
          h1.entry-title at 39.998px/500, 48px tall, above the cart table. D25
          made it visible again; the styling notes live's geometry in
          cart-page.css. */}
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/" className="inline-block py-1">
          עמוד הבית
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">סל הקניות</span>
      </nav>
      <h1 className="cart-page__title">סל הקניות</h1>

      {isEmpty ? (
        <CartEmptyState />
      ) : (
        <div className="cart-page__grid">
          <section aria-label="פריטים בעגלה">
            {/* The checkout button below is disabled while any line is
                unavailable, and until now the only way past it was to find each
                offending line and remove it by hand, one round trip each. With
                a cart of a dozen items and three dead lines that is a puzzle,
                not a checkout. The count comes from the rendered view; the
                server re-decides which lines those are when the button is
                pressed, because this view is as old as the last render. */}
            {hasUnavailable && (
              <div className="cart-page__blocked" role="alert">
                <p className="cart-page__blocked-text">
                  {unavailableCount === 1
                    ? 'פריט אחד בעגלה אינו זמין ואי אפשר להמשיך לתשלום איתו.'
                    : `${unavailableCount} פריטים בעגלה אינם זמינים ואי אפשר להמשיך לתשלום איתם.`}
                </p>
                <button
                  type="button"
                  className="cart-page__blocked-action"
                  onClick={() => void removeUnavailable()}
                  disabled={isPending}
                >
                  {unavailableCount === 1 ? 'הסר את הפריט' : 'הסר את הפריטים'}
                </button>
              </div>
            )}

            <div className="cart-page__items">
              {cart.items.map((item) => (
                <CartLineItem
                  key={`${item.product_id}::${item.variant_id ?? 'null'}`}
                  item={item}
                />
              ))}
            </div>

            <button
              type="button"
              className="cart-page__clear"
              onClick={() => void clear()}
              disabled={isPending}
            >
              רוקן עגלה
            </button>
          </section>

          <div>
            <CartTotalsSidebar cart={cart} />
            <div className="mt-4">
              <CartCheckoutButton
                isAuthenticated={isAuthenticated}
                disabled={hasUnavailable || isEmpty}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
