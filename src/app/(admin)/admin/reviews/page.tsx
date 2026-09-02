import { requireSection } from '@/lib/admin/rbac'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createAdminClient } from '@/lib/supabase/admin'
import ReviewActionsClient from './ReviewActionsClient'

export const metadata = { title: 'ביקורות ממתינות' }

interface PendingReview {
  id: string
  rating: number
  body: string | null
  created_at: string
  product: { name_he: string | null; slug: string | null } | null
  profile: { full_name: string | null; email: string | null } | null
}

/**
 * The moderation queue. Service-role read because pending rows are visible
 * only to their author by policy; the page itself is gated to catalog:write
 * readers via requireSection, and every decision goes through the audited
 * moderateReview action.
 */
export default async function AdminReviewsPage() {
  await requireSection('catalog', 'write')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('reviews' as never)
    .select(
      'id, rating, body, created_at, product:products(name_he, slug), profile:profiles(full_name, email)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100)

  if (error && error.code === TABLE_MISSING) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">ביקורות ממתינות</h1>
        <p className="text-gray-600">
          טבלת הביקורות עוד לא הוחלה — מיגרציה 154 ממתינה ב-<code>migrations/pending/</code>.
        </p>
      </div>
    )
  }

  const pending = (data ?? []) as unknown as PendingReview[]

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">ביקורות ממתינות ({pending.length})</h1>
      {pending.length === 0 ? (
        <p className="text-gray-600">אין ביקורות שממתינות לאישור.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((review) => (
            <li key={review.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{review.product?.name_he ?? 'מוצר'}</span>
                <span className="text-primary" aria-label={`${review.rating} מתוך 5`}>
                  {'★'.repeat(review.rating)}
                </span>
                <span className="text-gray-500">
                  {review.profile?.full_name ?? review.profile?.email ?? 'לקוח'}
                  {' · '}
                  {new Date(review.created_at).toLocaleDateString('he-IL')}
                </span>
              </div>
              {review.body ? <p className="mb-3 text-sm text-gray-800">{review.body}</p> : null}
              <ReviewActionsClient reviewId={review.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
