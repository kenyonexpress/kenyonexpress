import { getProductReviews } from '@/server/queries/reviews'
import ReportReview from './ReportReview'
import ReviewFormGate from './ReviewFormGate'

/**
 * Approved reviews plus, for a verified buyer with an unspent slot, the form.
 *
 * The approved list is anon-readable and cache-friendly, so it renders here.
 * The per-session "can I review" answer must not touch this cached tree
 * (catalogue-render-path.test.ts); <ReviewFormGate> asks for it client-side
 * through a server action after paint.
 *
 * With zero reviews the section renders only the gate (usually nothing): the
 * heading earns its place with content, and until pending/154 is applied the
 * reads degrade to exactly that.
 */
export default async function Reviews({ productId }: { productId: string }) {
  const { reviews, summary } = await getProductReviews(productId)

  if (reviews.length === 0) return <ReviewFormGate productId={productId} />

  return (
    <section aria-labelledby="reviews-heading" className="mt-10">
      <h2 id="reviews-heading" className="mb-4 text-xl font-bold">
        ביקורות מאומתות
        {summary ? (
          <span className="me-2 text-base font-normal text-gray-600">
            {summary.average} מתוך 5 · {summary.count} ביקורות
          </span>
        ) : null}
      </h2>
      <ReviewFormGate productId={productId} />
      <ul className="space-y-4">
        {reviews.map((review) => (
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

              Null until 199 is applied, so this renders nothing today and the
              list looks exactly as it did.
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

            <ReportReview reviewId={review.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}
