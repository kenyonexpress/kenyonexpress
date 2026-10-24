'use client'

import { useProductPurchaseCount } from '@/hooks/useProductPurchaseCount'

export interface PurchaseCountProps {
  productId: string
  initialCount: number
  /**
   * Variant controls the display style.
   * - 'compact': Small badge-like display for product cards
   * - 'full': Larger display with more text for product pages
   */
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Displays the number of purchases for a product in the last 30 days
 * with realtime updates via Supabase subscriptions.
 */
export default function PurchaseCount({
  productId,
  initialCount,
  variant = 'full',
  className = '',
}: PurchaseCountProps) {
  const count = useProductPurchaseCount(productId, initialCount)

  // Don't show if count is 0
  if (count === 0) {
    return null
  }

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800 ${className}`}
      >
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
        <span>{count} קנו לאחרונה</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 ${className}`}
    >
      <svg
        className="h-5 w-5 text-blue-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
      <div className="flex-1">
        <p className="text-sm font-semibold text-blue-900">
          {count} {count === 1 ? 'איש קנה' : 'אנשים קנו'} לאחרונה
        </p>
        <p className="text-xs text-blue-700">ב-30 הימים האחרונים</p>
      </div>
    </div>
  )
}
