import { getProductReviews } from '@/server/queries/reviews'
import ReviewFormGate from './ReviewFormGate'
import ReviewList from './ReviewList'

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
      <ReviewList reviews={reviews} />
    </section>
  )
}
