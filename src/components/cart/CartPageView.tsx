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
  const { cart, clear, isPending } = useCart()
  const isAuthenticated = useCartAuth()

  const hasUnavailable = cart.items.some((item) => !item.available)
  const isEmpty = cart.items.length === 0

  return (
    <div className="cart-page">
      {/* The live page names this route in a breadcrumb and has no visible
          heading at all. The h1 is kept and hidden rather than dropped: a
          document with no level-one heading is a real accessibility defect,
          and screen readers are not what the pixel diff is measuring. */}
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/">עמוד הבית</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">סל הקניות</span>
      </nav>
      <h1 className="cart-page__title">סל הקניות</h1>

      {isEmpty ? (
        <CartEmptyState />
      ) : (
        <div className="cart-page__grid">
          <section aria-label="פריטים בעגלה">
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
