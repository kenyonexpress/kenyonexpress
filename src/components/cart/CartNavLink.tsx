'use client'

import { useCart, useCartStoreApi } from '@/components/cart/CartProvider'
import { ShoppingCart } from '@/components/icons'
import HeaderBadge from '@/components/layout/HeaderBadge'
import { displayItemCount } from '@/lib/cart/store'
import { shekelsRounded } from '@/lib/money-format'
import { useStore } from 'zustand'

/**
 * 22px, live's `.handheld-header-links li>a{font-size:22px}`; the masthead
 * glyph is 1.429em of 16 = 22.86 and rounds to the same lucide size. The
 * colour is a class and not an inline style (UX03): an inline `color` beats
 * every hover utility, which is why this used to fade with `opacity-70`
 * instead of darkening to live's `a:hover{color:#29323a}`.
 */
const ICON = { size: 22, strokeWidth: 1.8 } as const

export default function CartNavLink() {
  const { cart, isPending, drawerOpen, toggleDrawer } = useCart()
  // The badge, and only the badge, may come from the mirror: it is a count, and
  // a count is the one thing the mirror holds. The price beside it stays on the
  // server cart, so a returning shopper sees "3" over ₪0 for the round trip
  // rather than a total that was true yesterday.
  const itemCount = useStore(useCartStoreApi(), displayItemCount)
  // The badge pops on a change that lands after the server cart has: the
  // mirror's 0 -> N on every page load must not pop (HeaderBadge.tsx).
  const serverConfirmed = useStore(useCartStoreApi(), (s) => s.serverConfirmed)
  const label = `עגלת קניות, ${itemCount} פריטים, ${shekelsRounded(cart.subtotal)}`

  return (
    <button
      type="button"
      // Toggle, not open. As a plain opener the icon could only ever open the
      // mini-cart, so the obvious way to dismiss it -- press the thing you
      // pressed to get it -- did nothing.
      onClick={toggleDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      data-mini-cart-trigger=""
      className={`tap-area -m-1 flex items-center gap-1.5 p-1 text-icon transition-colors hover:text-heading-hover ${isPending ? 'opacity-70' : ''}`}
    >
      <span className="relative">
        <ShoppingCart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        <HeaderBadge count={itemCount} armed={serverConfirmed} />
      </span>
      {/* MASTHEAD ONLY. Live's handheld cart is the glyph and its count
          (`li.cart > a > i + span.count`, no price); the masthead link adds
          `.cart-items-total-price` at 15.988px/700 in #333e48 (measured,
          docs/coupon-page-measured.md). Below xl the price pushed the glyph
          from live's x15 to x45 (logs/ux03/before.json). The aria-label
          above still reads the subtotal at every width. */}
      <span className="hidden text-base font-bold text-heading tabular-nums xl:inline">
        {shekelsRounded(cart.subtotal)}
      </span>
    </button>
  )
}
