import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { feedbackRatingLabel, feedbackStars } from '@/lib/orders/feedback'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LOW_RATING_MAX,
  type RatingFilter,
  type RatingSummary,
  type RatingValue,
  parseDays,
  parseRatingFilter,
  readRatingsOverview,
} from '@/server/queries/ratings-admin'
import Link from 'next/link'
import ReviewActionsClient from './ReviewActionsClient'

export const metadata = { title: 'דירוגים (פנימי)' }

/**
 * The owner's ratings page (STEP 45). Every score a buyer gave, on the
 * order (`order_feedback`) and on a product (`reviews`), in one place, with
 * the averages and the low ones first. Service-role read because both
 * tables are owner-scoped for `authenticated`; the page itself is gated to
 * orders readers via requireSection. Nothing on this page, and no number
 * derived from these rows, is rendered anywhere a visitor can see: that is
 * the business rule, and src/__tests__/ratings-never-public.test.ts pins it.
 *
 * The moderation buttons stay for pending product reviews, but they mean
 * "looked at" rather than "published": there is no public list for an
 * approved review to appear in.
 */

const WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 ימים' },
  { days: 90, label: '90 ימים' },
  { days: 0, label: 'הכול' },
]

const FILTERS: { value: RatingFilter; label: string }[] = [
  { value: 'all', label: 'כל הדירוגים' },
  { value: 'low', label: `נמוכים (עד ${LOW_RATING_MAX})` },
  { value: 5, label: '5' },
  { value: 4, label: '4' },
  { value: 3, label: '3' },
  { value: 2, label: '2' },
  { value: 1, label: '1' },
]

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לעיון',
  approved: 'נבדק',
  rejected: 'נדחה',
}

function href(days: number, filter: RatingFilter): string {
  const params = new URLSearchParams()
  params.set('days', days === 0 ? 'all' : String(days))
  if (filter !== 'all') params.set('rating', String(filter))
  return `/admin/reviews?${params.toString()}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function averageText(summary: RatingSummary): string {
  return summary.average == null ? '—' : summary.average.toLocaleString('he-IL')
}

export default async function AdminRatingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { role } = await requireSection('orders', 'read')
  const canModerate = canWriteSection(role, 'catalog')
  const raw = await props.searchParams
  const days = parseDays(raw.days)
  const filter = parseRatingFilter(raw.rating)

  const overview = await readRatingsOverview(createAdminClient(), { days, filter })
  const { feedback, reviews } = overview
  const windowLabel = WINDOWS.find((w) => w.days === days)?.label ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-heading">דירוגים (פנימי)</h1>
        <p className="mt-1 text-sm text-black/60" data-testid="ratings-private-note">
          כל הדירוגים כאן פרטיים: הלקוח מדרג אחרי המסירה, הדירוג מגיע לצוות בלבד ולא מוצג באתר, גם
          לא כממוצע.
        </p>
      </div>

      {/* Window and filter, as links: a reading page has no reason to be a form. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-black/50">טווח:</span>
        {WINDOWS.map((w) => (
          <Link
            key={w.days}
            href={href(w.days, filter)}
            aria-current={w.days === days ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 ${
              w.days === days
                ? 'border-brand-primary bg-brand-primary/20 font-semibold'
                : 'border-gray-200 bg-white hover:border-brand-primary'
            }`}
          >
            {w.label}
          </Link>
        ))}
        <span className="ms-4 text-black/50">דירוג:</span>
        {FILTERS.map((f) => (
          <Link
            key={String(f.value)}
            href={href(days, f.value)}
            aria-current={f.value === filter ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 ${
              f.value === filter
                ? 'border-brand-primary bg-brand-primary/20 font-semibold'
                : 'border-gray-200 bg-white hover:border-brand-primary'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* The numbers for the window */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`דירוגי הזמנה · ${windowLabel}`} value={feedback.summary.count} />
        <Kpi label="ממוצע חוויית הזמנה" value={averageText(feedback.summary)} suffix="/ 5" />
        <Kpi
          label={`דירוגים נמוכים (עד ${LOW_RATING_MAX})`}
          value={feedback.summary.low + reviews.summary.low}
          tone={feedback.summary.low + reviews.summary.low > 0 ? 'alert' : 'calm'}
        />
        <Kpi label="ביקורות מוצר ממתינות לעיון" value={reviews.pending} />
      </div>

      <Distribution summary={feedback.summary} />

      {/* Order experience */}
      <section className="rounded-xl border border-black/10 bg-white" data-section="order-ratings">
        <div className="border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            חוויית הזמנה ({feedback.entries.length})
          </h2>
        </div>
        {!feedback.available ? (
          <p className="px-5 py-6 text-sm text-black/50">
            טבלת המשוב עוד לא הוחלה: מיגרציה 247 ממתינה ב-<code>migrations/pending/</code>. עד אז
            הטופס בחשבון הלקוח מוסתר ואין מה להציג.
          </p>
        ) : feedback.entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-black/50">אין דירוגי הזמנה בטווח ובסינון שנבחרו.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {feedback.entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={entry.rating} />
                  <span className="font-semibold">{feedbackRatingLabel(entry.rating)}</span>
                  <span className="text-black/50">
                    {entry.customerName ?? entry.customerEmail ?? 'לקוח'} ·{' '}
                    {formatDate(entry.createdAt)}
                  </span>
                  <Link
                    href={`/admin/orders/${entry.orderId}`}
                    className="text-xs text-brand hover:underline"
                  >
                    להזמנה <span dir="ltr">{entry.orderId.slice(0, 8).toUpperCase()}</span>
                  </Link>
                </div>
                {entry.body ? (
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{entry.body}</p>
                ) : (
                  <p className="mt-1 text-xs text-black/40">דירוג בלבד, ללא טקסט</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Product reviews */}
      <section
        className="rounded-xl border border-black/10 bg-white"
        data-section="product-ratings"
      >
        <div className="border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            ביקורות מוצר ({reviews.entries.length})
          </h2>
          <p className="mt-0.5 text-xs text-black/50">
            "נבדק" ו"נדחה" הם סימון פנימי לעיון בלבד. אין רשימה ציבורית שביקורת מאושרת מופיעה בה.
          </p>
        </div>
        {!reviews.available ? (
          <p className="px-5 py-6 text-sm text-black/50">
            טבלת הביקורות עוד לא הוחלה: מיגרציה 154 ממתינה ב-<code>migrations/pending/</code>.
          </p>
        ) : reviews.entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-black/50">אין ביקורות מוצר בטווח ובסינון שנבחרו.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {reviews.entries.map((review) => (
              <li key={review.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="font-semibold">{review.productName ?? 'מוצר'}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      review.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : review.status === 'rejected'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {REVIEW_STATUS_LABELS[review.status] ?? review.status}
                  </span>
                  <span className="text-black/50">
                    {review.customerName ?? review.customerEmail ?? 'לקוח'} ·{' '}
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.body ? (
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{review.body}</p>
                ) : (
                  <p className="mt-1 text-xs text-black/40">דירוג בלבד, ללא טקסט</p>
                )}
                {canModerate && review.status === 'pending' ? (
                  <div className="mt-2">
                    <ReviewActionsClient reviewId={review.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Kpi({
  label,
  value,
  suffix,
  tone = 'calm',
}: {
  label: string
  value: number | string
  suffix?: string
  tone?: 'calm' | 'alert'
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'alert' ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-2xl font-bold text-heading">
        {typeof value === 'number' ? value.toLocaleString('he-IL') : value}
        {suffix ? <span className="ms-1 text-sm font-normal text-black/50">{suffix}</span> : null}
      </p>
      <p className="text-sm text-black/60">{label}</p>
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-primary" aria-label={`${rating} מתוך 5`} title={`${rating} מתוך 5`}>
      <span aria-hidden="true">{feedbackStars(rating)}</span>
    </span>
  )
}

function Distribution({ summary }: { summary: RatingSummary }) {
  if (summary.count === 0) return null
  const values: RatingValue[] = [5, 4, 3, 2, 1]
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" data-section="distribution">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">התפלגות דירוגי הזמנה</h2>
      <ul className="space-y-1.5">
        {values.map((value) => {
          const n = summary.distribution[value]
          const pct = summary.count > 0 ? Math.round((n / summary.count) * 100) : 0
          return (
            <li key={value} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0">
                {value} <span aria-hidden="true">★</span>
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={`block h-full ${value <= LOW_RATING_MAX ? 'bg-red-400' : 'bg-brand-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-20 shrink-0 text-end text-black/60">
                {n.toLocaleString('he-IL')} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
