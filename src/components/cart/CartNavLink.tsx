'use client'

import { useCart, useCartStoreApi } from '@/components/cart/CartProvider'
import ShoppingBag from '@/components/icons/electro/ShoppingBag'
import { displayItemCount } from '@/lib/cart/store'
import { t } from '@/lib/i18n/messages'
import { useStore } from 'zustand'

/**
 * The cart icon with Electro's yellow round counter, and nothing beside it.
 *
 * THE PRICE IS GONE ON PURPOSE (W01, 2026-10-05). This used to render
 * `shekelsRounded(cart.subtotal)` next to the bag, the way Electro's
 * `.cart-items-total-price` does. The icon row is now held to Electro's
 * masthead exactly and that span is the one thing in it this project does not
 * render -- the count is on the badge and the sum is in the mini-cart. The
 * measurement of the span is kept in refs/electro-header-icons.json for the
 * record, flagged `rendered_here: false`.
 *
 * The badge reads the client mirror, which is the one thing the mirror holds
 * (a count), so a returning shopper sees their number before the server cart
 * round-trips. It shows 0 rather than hiding, as Electro's does.
 */
export default function CartNavLink() {
  const { isPending, drawerOpen, toggleDrawer } = useCart()
  const itemCount = useStore(useCartStoreApi(), displayItemCount)
  const label = `${t('nav.cart')}, ${itemCount} פריטים`

  return (
    <button
      type="button"
      // Toggle, not open: pressing the thing you pressed to get the mini-cart
      // is the obvious way to dismiss it.
      onClick={toggleDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      data-mini-cart-trigger=""
      className={`header-icon__trigger ${isPending ? 'opacity-70' : ''}`}
    >
      <span className="header-icon__glyph">
        <ShoppingBag />
      </span>
      <span className="cart-items-count header-icon-counter" aria-hidden="true">
        {itemCount > 99 ? '99+' : itemCount}
      </span>
    </button>
  )
}
