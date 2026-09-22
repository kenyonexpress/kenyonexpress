import { requireStaffSession } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import ReviewModerationActions from './ReviewModerationActions'

export const metadata = { title: 'ביקורות ממתינות' }

type PendingReview = {
  id: string
  rating: number
  body: string | null
  created_at: string
  product_id: string
  products: { name_he: string | null; slug: string | null } | null
}

export default async function AdminReviewsPage() {
  await requireStaffSession()
  const admin = createAdminClient()
  const { data } = await admin
    .from('reviews')
    .select('id, rating, body, created_at, product_id, products(name_he, slug)')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100)

  const rows = (data ?? []) as unknown as PendingReview[]

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900">ביקורות ממתינות</h1>
      <p className="text-sm text-gray-500">
        ביקורת מתפרסמת רק אחרי אישור. דחייה משאירה את השורה ולא מוחקת אותה, כדי שהלקוח לא יוכל לשלוח
        שוב את אותו טקסט.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
          אין ביקורות ממתינות.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="font-semibold">{row.products?.name_he ?? 'מוצר'}</p>
              <p className="mt-1 text-sm text-gray-600">דירוג: {row.rating} מתוך 5</p>
              {row.body ? <p className="mt-2 text-sm text-gray-800">{row.body}</p> : null}
              <ReviewModerationActions reviewId={row.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
