'use client'

import { ShoppingCart } from 'lucide-react'

interface StickyCartBarProps {
  price: number
  onAddToCart: () => Promise<void>
  isLoading?: boolean
}

export default function StickyCartBar({
  price,
  onAddToCart,
  isLoading = false,
}: StickyCartBarProps) {
  const formatter = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  })

  return (
    <div
      data-sticky-cart-bar
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-3 flex items-center justify-between gap-2 z-30 md:bottom-auto md:top-0"
    >
      <div className="text-lg font-bold text-foreground">{formatter.format(price / 100)}</div>
      <button
        type="button"
        onClick={onAddToCart}
        disabled={isLoading}
        className="flex-1 bg-brand hover:bg-brand/90 disabled:opacity-50 text-gray-900 font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        <ShoppingCart size={20} />
        <span>הוסף לעגלה</span>
      </button>
    </div>
  )
}
