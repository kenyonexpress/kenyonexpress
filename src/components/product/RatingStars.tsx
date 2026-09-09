import type { RatingSummary } from '@/lib/reviews/reviews'

/**
 * Five stars and the count, in the two sizes the site needs.
 *
 * NO STATE AND NO HOOKS, so it renders from either side of the boundary
 * unchanged: `ProductInfo` and the reviews section are server-rendered, and
 * `ProductCard` is a client component that imports it and therefore bundles it.
 * That is the reason it takes a plain summary object rather than fetching:
 * every caller already holds one from a cached read, and a component that
 * fetched could not be used from the card at all.
 *
 * IT RENDERS NOTHING WITHOUT A SUMMARY, and that is the rule the whole feature
 * turns on. `ProductInfo` already records it for the neighbouring slot: live
 * fills this space with a score and we do not fabricate one. An empty star row
 * is a fabricated score of zero -- it reads as "rated, badly" rather than as
 * "not rated yet" -- so with no approved reviews there is no element at all,
 * and the card keeps exactly the geometry it has today.
 *
 * THE FILLED COUNT IS ROUNDED, THE NUMBER BESIDE IT IS NOT. 4.3 paints four
 * stars and says 4.3. Painting 4.3 stars needs a clipped overlay, and the
 * precision it buys is already in the text.
 */
export default function RatingStars({
  summary,
  size = 'sm',
  className = '',
}: {
  summary: RatingSummary | null
  size?: 'sm' | 'md'
  /** Extra classes on the wrapper. Spacing belongs to the caller's layout. */
  className?: string
}) {
  if (!summary) return null

  const filled = Math.round(summary.average)
  const starClass = size === 'md' ? 'text-lg' : 'text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      // One label for the pair. Without it a screen reader reads ten star
      // glyphs and then a bare number.
      aria-label={`דירוג ${summary.average} מתוך 5, ${summary.count} ביקורות`}
    >
      <span aria-hidden="true" className={`${starClass} text-primary`}>
        {'★'.repeat(filled)}
        <span className="text-gray-300">{'★'.repeat(5 - filled)}</span>
      </span>
      <span aria-hidden="true" className="text-nano text-muted tabular-nums">
        ({summary.count})
      </span>
    </span>
  )
}
