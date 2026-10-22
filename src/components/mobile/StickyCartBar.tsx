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
    // Mobile only. The desktop product page has its own buy box in the summary
    // column, and this bar used to re-pin itself to the top of the viewport
    // from md up, which mobile-shell.spec has asserted against since it was
    // written.
    //
    // bottom-14, not bottom-0: MobileNavBar is fixed to the bottom at h-14 and
    // z-40, and at bottom-0 this bar (z-30) sat UNDER it, so the buy button was
    // never tappable on a phone. Measured 2026-10-21: every click on it was
    // intercepted by the nav's "חיפוש" link until the test timed out. The
    // store layout already pads <main> by the same 14 for the nav.
    <div
      data-sticky-cart-bar
      className="md:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-border p-3 flex items-center justify-between gap-2 z-30"
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
