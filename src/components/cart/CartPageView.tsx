'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import CartLineItem, { CartEmptyState } from '@/components/cart/CartLineItem'
import { useCart } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import type { CartView } from '@/lib/cart/types'
import { useEffect } from 'react'

export default function CartPageView({
  initialCart,
  isAuthenticated,
}: {
  initialCart: CartView
  isAuthenticated: boolean
}) {
  const { cart, setCart, clear, isPending } = useCart()

  useEffect(() => {
    setCart(initialCart)
  }, [initialCart, setCart])

  const hasUnavailable = cart.items.some((item) => !item.available)
  const isEmpty = cart.items.length === 0

  return (
    <div className="cart-page">
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
