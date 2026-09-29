import { t } from '@/lib/i18n/messages'
import { formatAverageHe } from '@/lib/reviews/eligibility'
import { Star } from 'lucide-react'
import Link from 'next/link'

const STAR_POSITIONS = [0, 1, 2, 3, 4] as const

interface Props {
  /** Null, or zero-count, renders nothing: no fabricated score ever appears here. */
  summary: { count: number; averageTenths: number } | null
  href: string
  className?: string
}

/**
 * The slot live fills with its star rating (`.pdp-summary__rating` in
 * product-page.css), pointing at the product's own reviews page. Five stars,
 * rounded to the nearest whole star, plus the exact average and count so
 * "4.5" is never silently read as 4 or 5 stars filled.
 */
export default function RatingStars({ summary, href, className = '' }: Props) {
  if (!summary || summary.count === 0) return null
  const filled = Math.round(summary.averageTenths / 10)
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 align-middle text-link hover:underline ${className}`}
    >
      <span className="inline-flex" aria-hidden="true">
        {STAR_POSITIONS.map((position) => (
          <Star
            key={position}
            size={14}
            strokeWidth={1.8}
            className={position < filled ? 'fill-current text-price' : 'text-border-alt'}
          />
        ))}
      </span>
      <span>
        {t('reviewsPage.summaryLink')
          .replace('{avg}', formatAverageHe(summary.averageTenths))
          .replace('{count}', String(summary.count))}
      </span>
    </Link>
  )
}
