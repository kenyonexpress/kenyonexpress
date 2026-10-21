'use client'

import { useCart, useCartStoreApi } from '@/components/cart/CartProvider'
import { EcShoppingBag } from '@/components/icons/electro-icons'
import { displayItemCount } from '@/lib/cart/store'
import { shekelsRounded } from '@/lib/money-format'
import { useStore } from 'zustand'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

export default function CartNavLink() {
  const { cart, isPending, drawerOpen, toggleDrawer } = useCart()
  // The badge, and only the badge, may come from the mirror: it is a count, and
  // a count is the one thing the mirror holds. The price beside it stays on the
  // server cart, so a returning shopper sees "3" over ₪0 for the round trip
  // rather than a total that was true yesterday.
  const itemCount = useStore(useCartStoreApi(), displayItemCount)

  /*
   The accessible name is built from content, not from an aria-label.
   axe's label-content-name-mismatch takes everything painted inside the
   button as its visible label, the badge digit included (aria-hidden does
   not matter to it), and requires that run to appear contiguously inside
   the name. "1" then "699 ₪" can never sit contiguously next to a count
   of "1 פריטים", so every page with an item in the cart failed the scan.
   A screen reader now hears "עגלת קניות, 1 פריטים, 699 ₪" from the
   sr-only run plus the visible price, and a sighted user sees the badge.
   */
  // Toggle, not open. As a plain opener the icon could only ever open the
  // mini-cart, so the obvious way to dismiss it -- press the thing you
  // pressed to get it -- did nothing.
  const buttonClass = `hit-44 -m-1 flex items-center gap-1.5 p-1 transition-opacity hover:opacity-70 ${isPending ? 'opacity-70' : ''}`
  return (
    <button
      type="button"
      onClick={toggleDrawer}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      data-mini-cart-trigger=""
      className={buttonClass}
      style={{ color: ICON.color }}
    >
      <span className="sr-only">עגלת קניות, {itemCount} פריטים, </span>
      <span className="relative">
        <EcShoppingBag size={ICON.size} aria-hidden="true" />
        {itemCount > 0 && (
          <span
            className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-nano font-bold text-brand-dark"
            aria-hidden="true"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </span>
      <span className="text-sm font-semibold text-black tabular-nums">
        {shekelsRounded(cart.subtotal)}
      </span>
    </button>
  )
}
