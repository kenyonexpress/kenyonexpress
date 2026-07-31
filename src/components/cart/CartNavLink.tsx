'use client'

import { useCart } from '@/components/cart/CartProvider'
import { shekelsRounded } from '@/lib/cart/format'
import { ShoppingCart } from 'lucide-react'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

export default function CartNavLink() {
  const { cart, isPending, openDrawer } = useCart()
  const label = `עגלת קניות, ${cart.item_count} פריטים, ${shekelsRounded(cart.subtotal)}`

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      className={`flex items-center gap-1.5 transition-opacity hover:opacity-70 ${isPending ? 'opacity-70' : ''}`}
      style={{ color: ICON.color }}
    >
      <span className="relative">
        <ShoppingCart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        {cart.item_count > 0 && (
          <span
            className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-nano font-bold text-brand-dark"
            aria-hidden="true"
          >
            {cart.item_count > 99 ? '99+' : cart.item_count}
          </span>
        )}
      </span>
      <span className="text-sm font-semibold text-black tabular-nums">
        {shekelsRounded(cart.subtotal)}
      </span>
    </button>
  )
}
