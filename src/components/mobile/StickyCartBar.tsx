'use client'

import { ShoppingCart } from '@/components/icons'
import { useCallback } from 'react'

interface StickyCartBarProps {
  price: number
  onAddToCart: () => void
  isLoading?: boolean
}

export default function StickyCartBar({
  price,
  onAddToCart,
  isLoading = false,
}: StickyCartBarProps) {
  const handleClick = useCallback(() => {
    if (!isLoading) {
      onAddToCart()
    }
  }, [onAddToCart, isLoading])

  const formattedPrice = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)

  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 safe-pb z-40"
      data-sticky-cart-bar
    >
      <div className="flex items-center justify-between p-4 gap-4">
        <div className="flex flex-col items-start gap-1 flex-1">
          <span className="text-xs text-gray-600">מחיר</span>
          <span className="text-lg font-bold text-gray-900">{formattedPrice}</span>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading}
          className={`
            flex items-center justify-center gap-2 px-6 py-2 h-12 rounded-lg
            font-semibold text-white transition-all duration-200
            whitespace-nowrap
            ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600'
            }
          `}
          aria-busy={isLoading}
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{isLoading ? 'מוסיף...' : 'הוסף לסל'}</span>
        </button>
      </div>
    </div>
  )
}
