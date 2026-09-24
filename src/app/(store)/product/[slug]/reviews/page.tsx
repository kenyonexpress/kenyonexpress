import { formatDate } from '@/lib/i18n/format'
import { t } from '@/lib/i18n/messages'
import { loadProductBySlug } from '@/lib/product-detail'
import { aggregateRatings, formatAverageHe } from '@/lib/reviews/eligibility'
import { listApprovedReviews } from '@/server/queries/reviews'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: raw } = await params
  const slug = decodeURIComponent(raw)
  return {
    title: t('reviewsPage.title'),
    robots: { index: true, follow: true },
    alternates: { canonical: `/product/${encodeURIComponent(slug)}/reviews` },
  }
}

export default function ProductReviewsPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted">{t('reviewsPage.loading')}</p>}>
        <ProductReviewsBody {...props} />
      </Suspense>
    </main>
  )
}

async function ProductReviewsBody({ params }: Props) {
  const { slug: raw } = await params
  const slug = decodeURIComponent(raw)
  const product = await loadProductBySlug(slug)
  if (!product) notFound()

  const reviews = await listApprovedReviews(product.product.id)
  const aggregate = aggregateRatings(reviews.map((row) => row.rating))

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link
          href={`/product/${encodeURIComponent(slug)}`}
          className="font-semibold text-price underline"
        >
          {t('reviewsPage.backToProduct')}
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-heading">
        {t('reviewsPage.titleFor').replace('{name}', product.product.name_he ?? '')}
      </h1>
      {aggregate ? (
        <p className="mt-2 text-sm text-muted">
          {t('reviewsPage.average')
            .replace('{avg}', formatAverageHe(aggregate.averageTenths))
            .replace('{count}', String(aggregate.count))}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('reviewsPage.none')}</p>
      )}
      {reviews.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-border-alt p-4">
              <p className="text-sm font-semibold">
                {t('reviewsPage.outOf').replace('{value}', String(review.rating))}
              </p>
              {review.body ? <p className="mt-2 text-sm text-heading">{review.body}</p> : null}
              <p className="mt-2 text-xs text-muted">{formatDate(review.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
