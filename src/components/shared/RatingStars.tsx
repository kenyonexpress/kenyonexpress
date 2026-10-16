'use client'

import { Star } from '@/components/icons/Star'
import { cn } from '@/lib/utils'

export interface RatingStarsProps {
  /** Rating value from 0 to 5, supports half-stars (e.g., 3.5) */
  rating: number
  /** Optional count of ratings for Hebrew display, e.g., "523 דירוגים" */
  count?: number
  /** CSS class for styling */
  className?: string
  /** If true, render inline with count text; if false, stars only */
  showCount?: boolean
  /** Icon size in pixels */
  size?: number
  /** Custom aria-label, defaults to Hebrew format */
  ariaLabel?: string
}

/**
 * Rating stars component with half-star support, aria labels, and Hebrew count display.
 * Used in admin areas and internal contexts per STEP 45 policy (ratings never public).
 *
 * Supports:
 * - Half-star display (0.5, 1.5, 2.5, 3.5, 4.5)
 * - Aria labels in Hebrew for accessibility
 * - Count display in Hebrew (e.g., "523 דירוגים")
 * - Semantic HTML with proper roles and attributes
 */
export function RatingStars({
  rating,
  count,
  className,
  showCount = true,
  size = 20,
  ariaLabel,
}: RatingStarsProps) {
  const clampedRating = Math.min(5, Math.max(0, rating))
  const fullStars = Math.floor(clampedRating)
  const hasHalfStar = clampedRating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)

  const countText = count ? `${count} ${count === 1 ? 'דירוג' : 'דירוגים'}` : null

  const defaultLabel = `${clampedRating} מתוך 5 כוכבים${countText ? `, ${countText}` : ''}`
  const label = ariaLabel || defaultLabel

  return (
    <div
      className={cn(
        'rating-stars flex items-center gap-1',
        showCount && count && 'gap-2',
        className,
      )}
      role="img"
      aria-label={label}
    >
      <div className="rating-stars__stars flex gap-0.5" aria-hidden="true">
        {/* Full stars */}
        {Array.from({ length: fullStars }).map((_, i) => {
          const uniqueKey = `full-${clampedRating}-${i}`
          return (
            <span key={uniqueKey} data-star-state="full" className="inline-flex">
              <Star size={size} className="text-brand fill-current" />
            </span>
          )
        })}

        {/* Half star */}
        {hasHalfStar && (
          <span
            key={`half-${clampedRating}`}
            data-star-state="half"
            className="relative inline-flex"
          >
            <Star size={size} className="text-gray-300" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
              <Star size={size} className="text-brand fill-current" />
            </div>
          </span>
        )}

        {/* Empty stars */}
        {Array.from({ length: emptyStars }).map((_, i) => {
          const uniqueKey = `empty-${clampedRating}-${i}`
          return (
            <span key={uniqueKey} data-star-state="empty" className="inline-flex">
              <Star size={size} className="text-gray-300" />
            </span>
          )
        })}
      </div>

      {/* Count text in Hebrew */}
      {showCount && countText && (
        <span className="rating-stars__count text-sm text-muted whitespace-nowrap">
          ({countText})
        </span>
      )}
    </div>
  )
}
