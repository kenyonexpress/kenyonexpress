import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import ReplyForm from './ReplyForm'

export const metadata = { title: 'ביקורות' }

/**
 * What customers said about this supplier's products, and the box to answer in.
 *
 * `manager`, matching the orders page: a review names a customer's experience
 * of this business, and the reply is published under the business's name.
 *
 * THE LIST IS READ WITH THE SERVICE ROLE AND THE WRITE IS NOT, which looks
 * inconsistent and is deliberate. The read has to join `products` to find this
 * supplier's reviews, and `reviews`'s public SELECT policy is
 * `status = 'approved'` with no supplier dimension at all — so a supplier
 * reading through their own session would see every approved review on the
 * site, not theirs. The filter here is `product.supplier_id`, applied in the
 * query, and it is the ONLY thing narrowing the list.
 *
 * The write is the opposite: 199's UPDATE policy carries the supplier check in
 * SQL, so `replyToReview` goes through the request-scoped client and lets the
 * database refuse. Read filtered in code, write filtered in the database, and
 * the reason for each is that it is where the check can actually live.
 *
 * Requires 199 for the reply columns and returns an empty list without it.
 * `reviews` holds 0 rows in production (measured 2026-09-09), so this page is
 * empty today whether or not the migration lands.
 */

type Row = {
  id: string
  rating: number
  body: string | null
  created_at: string
  supplier_reply: string | null
  products: { name_he: string | null } | { name_he: string | null }[] | null
}

export default async function SupplierReviewsPage() {
  const session = await requireSupplierRole('manager', '/supplier/reviews')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('reviews' as never)
    .select('id, rating, body, created_at, supplier_reply, products!inner(name_he, supplier_id)')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .eq('products.supplier_id', session.supplierId)
    .order('created_at', { ascending: false })
    .limit(50)

  // The error is READ, not discarded. `42703`/`PGRST204` is 199 being unapplied
  // -- `supplier_reply` does not exist yet -- and the honest answer to that is
  // an empty list, the same thing a supplier with no reviews sees. Anything
  // else is a failure worth a line in the log, because a supplier looking at
  // "no reviews" when there are reviews has no way to tell.
  if (error && !['42703', 'PGRST204'].includes(error.code ?? '')) {
    log.warn('supplier.reviews_read_failed', {
      supplierId: session.supplierId,
      reason: error.message,
    })
  }

  const rows = (data ?? []) as unknown as Row[]

  return (
    <main dir="rtl" className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold text-heading">ביקורות</h1>
      <p className="mt-1 text-sm text-gray-500">
        ביקורות מאושרות על המוצרים שלכם. תגובה מתפרסמת מתחת לביקורת בעמוד המוצר.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">אין עדיין ביקורות.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((row) => {
            const product = Array.isArray(row.products) ? row.products[0] : row.products
            return (
              <li key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-heading">{product?.name_he ?? 'מוצר'}</p>
                <p className="mt-1 text-primary" aria-label={`${row.rating} מתוך 5`}>
                  {'★'.repeat(row.rating)}
                  <span className="text-gray-300">{'★'.repeat(5 - row.rating)}</span>
                </p>
                {row.body && <p className="mt-2 text-sm text-gray-800">{row.body}</p>}
                <ReplyForm reviewId={row.id} existing={row.supplier_reply} />
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
