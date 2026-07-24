'use client'

import { useCart } from '@/components/cart/CartProvider'
import { ShoppingCart } from 'lucide-react'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

function formatBadgeTotal(value: number): string {
  if (value <= 0) return '₪0'
  return `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
}

export default function CartNavLink() {
  const { cart, isPending, openDrawer } = useCart()
  const label = `עגלת קניות, ${cart.item_count} פריטים, ${formatBadgeTotal(cart.subtotal)}`

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={label}
      aria-haspopup="dialog"
      className={`inline-flex min-h-11 items-center gap-1.5 transition-opacity hover:opacity-70 ${isPending ? 'opacity-70' : ''}`}
      style={{ color: ICON.color }}
    >
      <span className="relative">
        <ShoppingCart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        {cart.item_count > 0 && (
          <span
            className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-bold text-brand-dark"
            aria-hidden="true"
          >
            {cart.item_count > 99 ? '99+' : cart.item_count}
          </span>
        )}
      </span>
      <span className="text-sm font-semibold text-black tabular-nums">
        {formatBadgeTotal(cart.subtotal)}
      </span>
    </button>
  )
}
