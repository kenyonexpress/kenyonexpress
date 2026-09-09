'use client'

import { t } from '@/lib/i18n/messages'
import type { ApprovedReview } from '@/server/queries/reviews'
import { useMemo, useState } from 'react'
import HelpfulVote from './HelpfulVote'
import ReportReview from './ReportReview'

/**
 * The approved reviews, with a sort the reader controls.
 *
 * THE SORT REORDERS WHAT IS ALREADY HERE, AND DOES NOT REFETCH. The server
 * sends one capped page ordered by recency, and that order is what decides
 * MEMBERSHIP; this only decides presentation. Two consequences worth stating
 * because they are the whole design:
 *
 *   - "Most helpful" means most helpful OF THE REVIEWS ON THIS PAGE. It is not
 *     a claim about the most helpful review ever written for the product, and
 *     with a cap of 20 on a catalogue whose busiest product has none, the two
 *     are the same set anyway.
 *   - The product page stays STATICALLY RENDERED. Putting the order in the URL
 *     would mean reading `searchParams`, which makes the page dynamic under
 *     `cacheComponents` - and `catalogue-render-path.test.ts` exists precisely
 *     to stop that tree acquiring a per-request read. A sort control is not
 *     worth the LCP of the product page.
 *
 * Until 222 is applied every `helpful_count` is 0, so the helpful order is the
 * recency order. That is correct rather than a degradation: nothing can have
 * been voted helpful on a database with no votes table.
 */
export default function ReviewList({ reviews }: { reviews: readonly ApprovedReview[] }) {
  const [sort, setSort] = useState<'recent' | 'helpful'>('recent')

  const ordered = useMemo(() => {
    if (sort === 'recent') return reviews
    // Recency stays the tiebreak, so an unvoted list keeps a stable, meaningful
    // order rather than whatever the sort happens to do with equal keys.
    return [...reviews].sort(
      (a, b) => b.helpful_count - a.helpful_count || b.created_at.localeCompare(a.created_at),
    )
  }, [reviews, sort])

  return (
    <>
      {reviews.length > 1 ? (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span className="text-gray-600">{t('reviews.sortLabel')}</span>
          <button
            type="button"
            onClick={() => setSort('recent')}
            aria-pressed={sort === 'recent'}
            className={sort === 'recent' ? 'font-semibold text-heading' : 'text-gray-600 underline'}
          >
            {t('reviews.sortRecent')}
          </button>
          <button
            type="button"
            onClick={() => setSort('helpful')}
            aria-pressed={sort === 'helpful'}
            className={
              sort === 'helpful' ? 'font-semibold text-heading' : 'text-gray-600 underline'
            }
          >
            {t('reviews.sortHelpful')}
          </button>
        </div>
      ) : null}

      <ul className="space-y-4">
        {ordered.map((review) => (
          <li key={review.id} className="rounded-lg border border-gray-100 p-4">
            <div className="mb-1 flex items-center gap-2">
              {/* One review, so the count in RatingStars would read "(1)" on
                  every row. This is the per-row rating, not an aggregate. */}
              <span aria-label={`${review.rating} מתוך 5`} className="text-primary">
                {'★'.repeat(review.rating)}
                <span className="text-gray-300">{'★'.repeat(5 - review.rating)}</span>
              </span>
              <time dateTime={review.created_at} className="text-xs text-gray-500">
                {new Date(review.created_at).toLocaleDateString('he-IL')}
              </time>
            </div>
            {review.title ? (
              <p className="mb-1 text-sm font-semibold text-heading">{review.title}</p>
            ) : null}
            {review.body ? <p className="text-sm text-gray-800">{review.body}</p> : null}

            {/*
              THE SUPPLIER'S ANSWER, indented and labelled, under the review it
              answers. A one-star review with no reply and a one-star review with
              "we are sorry, the masseuse was ill that day and we refunded you"
              are different documents; the second is the one that makes a shopper
              trust the shop.
            */}
            {review.supplier_reply ? (
              <div className="mt-3 border-black/10 border-s-2 ps-3">
                <p className="text-xs font-semibold text-heading">תגובת בית העסק</p>
                <p className="text-sm text-gray-800">{review.supplier_reply}</p>
                {review.supplier_replied_at ? (
                  <time dateTime={review.supplier_replied_at} className="text-xs text-gray-500">
                    {new Date(review.supplier_replied_at).toLocaleDateString('he-IL')}
                  </time>
                ) : null}
              </div>
            ) : null}

            <HelpfulVote reviewId={review.id} initialCount={review.helpful_count} />
            <ReportReview reviewId={review.id} />
          </li>
        ))}
      </ul>
    </>
  )
}
