'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import { useCart, useCartAuth, useCartStoreApi } from '@/components/cart/CartProvider'
import { displayItemCount } from '@/lib/cart/store'
import { shekelsRounded } from '@/lib/money-format'
import { ShoppingCart } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useStore } from 'zustand'

/**
 * Body class the bar sets while it is on screen. CSS reads it to pad the page
 * bottom so the last row of a grid is not buried under the bar, and to lift
 * the WhatsApp float above it. A class rather than inline styles on those
 * elements because they are server components that know nothing of the cart.
 */
export const MOBILE_CART_BAR_CLASS = 'mobile-cart-bar-visible'

/**
 * Routes where the bar has nothing to add: the cart page IS the cart, the
 * checkout is past it, and account pages are not shopping. Prefix matches so
 * `/checkout/failed` and `/account/orders/…` are covered.
 */
export function isMobileCartBarRoute(pathname: string | null): boolean {
  if (!pathname) return false
  for (const prefix of ['/cart', '/checkout', '/account', '/login', '/signup', '/admin']) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return false
  }
  return true
}

/**
 * The phone's sticky cart: a bar pinned to the bottom of the viewport while
 * the cart has something in it, with the count, the subtotal, a press that
 * opens the sheet and the checkout link.
 *
 * On a phone the only way back to a cart was the icon in the sticky header,
 * and the header is what a shopper scrolls away from first. The bar is hidden
 * above 767px in mini-cart.css (the desktop has the dropdown and room for it),
 * while the drawer is open (the sheet covers it and its own footer has the
 * same two controls), on the routes above, and while the cart is empty.
 *
 * It reads the badge's count, not the cart's: before the server answers, the
 * mirror is what the header shows, and a bar that disagreed with the badge
 * above it would look like two carts.
 */
export default function MobileCartBar() {
  const { cart, drawerOpen, openDrawer, fallbackActive } = useCart()
  const itemCount = useStore(useCartStoreApi(), displayItemCount)
  const isAuthenticated = useCartAuth()
  const pathname = usePathname()

  const visible = itemCount > 0 && !drawerOpen && isMobileCartBarRoute(pathname)

  useEffect(() => {
    if (!visible) return
    document.body.classList.add(MOBILE_CART_BAR_CLASS)
    return () => document.body.classList.remove(MOBILE_CART_BAR_CLASS)
  }, [visible])

  if (!visible) return null

  const blocked = cart.items.some((item) => !item.available) || fallbackActive
  const label = `${itemCount} ${itemCount === 1 ? 'פריט' : 'פריטים'} בעגלה, ${shekelsRounded(cart.subtotal)}, פתח את העגלה`

  return (
    <div className="mobile-cart-bar" data-mobile-cart-bar="">
      <button
        type="button"
        className="mobile-cart-bar__summary"
        onClick={openDrawer}
        aria-label={label}
      >
        <span className="mobile-cart-bar__icon">
          <ShoppingCart size={22} strokeWidth={1.8} aria-hidden="true" />
          <span className="mobile-cart-bar__count" aria-hidden="true">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        </span>
        <span className="mobile-cart-bar__text" aria-hidden="true">
          <span className="mobile-cart-bar__label">
            {itemCount === 1 ? 'פריט אחד' : `${itemCount} פריטים`}
          </span>
          <strong className="mobile-cart-bar__total tabular-nums">
            {shekelsRounded(cart.subtotal)}
          </strong>
        </span>
      </button>
      {/* The same gate as every other checkout button: an unavailable line
          or a cart the server has not priced refuses, and the sheet (one press
          away) is where the reason is printed. */}
      <CartCheckoutButton
        isAuthenticated={isAuthenticated}
        disabled={blocked}
        className="mobile-cart-bar__checkout"
      />
    </div>
  )
}
