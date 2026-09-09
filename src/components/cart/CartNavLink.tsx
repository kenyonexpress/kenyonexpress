'use client'

import { useCart, useCartStoreApi } from '@/components/cart/CartProvider'
import { displayItemCount } from '@/lib/cart/store'
import { shekelsRounded } from '@/lib/money-format'
import { ShoppingCart } from 'lucide-react'
import { useStore } from 'zustand'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

export default function CartNavLink() {
  const { cart, isPending, drawerOpen, toggleDrawer } = useCart()
  // The badge, and only the badge, may come from the mirror: it is a count, and
  // a count is the one thing the mirror holds. The price beside it stays on the
  // server cart, so a returning shopper sees "3" over ₪0 for the round trip
  // rather than a total that was true yesterday.
  const itemCount = useStore(useCartStoreApi(), displayItemCount)
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
      className={`-m-1 flex items-center gap-1.5 p-1 transition-opacity hover:opacity-70 ${isPending ? 'opacity-70' : ''}`}
      style={{ color: ICON.color }}
    >
      <span className="relative">
        <ShoppingCart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
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
