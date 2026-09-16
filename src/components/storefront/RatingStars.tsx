import { Star } from 'lucide-react'

export interface RatingSummary {
  /** One-decimal average over approved reviews, 1..5. */
  average: number
  count: number
}

/**
 * The star row live fills its rating slot with.
 *
 * Only two numbers reach a visitor -- the average and the count -- and only
 * once at least one review has been approved. That is the whole of what
 * `product_rating_summary` (235) exposes; review text stays in moderation
 * (232). A zero-count rating renders nothing rather than five grey stars, so
 * the page never claims a score it does not have.
 */
export default function RatingStars({ rating }: { rating: RatingSummary | null }) {
  if (!rating || rating.count <= 0) return null
  const average = Math.min(5, Math.max(0, rating.average))
  const rounded = Math.round(average * 2) / 2
  const label = `דירוג ${average.toLocaleString('he-IL', { maximumFractionDigits: 1 })} מתוך 5, ${
    rating.count === 1 ? 'ביקורת אחת' : `${rating.count} ביקורות`
  }`

  return (
    <span className="pdp-rating" role="img" aria-label={label} title={label} dir="rtl">
      <span className="pdp-rating__stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = rounded >= n ? 'full' : rounded >= n - 0.5 ? 'half' : 'empty'
          return (
            <span key={n} className={`pdp-rating__star pdp-rating__star--${fill}`}>
              <Star size={14} strokeWidth={1.5} />
              {fill === 'half' && (
                <span className="pdp-rating__half">
                  <Star size={14} strokeWidth={1.5} />
                </span>
              )}
            </span>
          )
        })}
      </span>
      <span className="pdp-rating__count" aria-hidden="true">
        ({rating.count})
      </span>
    </span>
  )
}
