import StatusBadge from '@/components/admin/StatusBadge'
import { requireSection } from '@/lib/admin/rbac'
import { supplierReadiness } from '@/lib/admin/supplier-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { likeContains } from '@/lib/utils/search-escape'
import type { Supplier } from '@/types/database'
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'ספקים' }

/**
 * The suppliers list, over `public.suppliers`.
 *
 * This screen used to render `public.vendors`, a different six-row table that
 * no product, order line or voucher references, so nothing an admin edited here
 * could reach a product page. The legacy screen still exists, at /admin/vendors.
 * See docs/ADMIN-ARCHITECTURE.md section 2.
 */

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'active', label: 'פעילים' },
  { value: 'inactive', label: 'לא פעילים' },
  { value: 'incomplete', label: 'חסרי פרטים' },
]

interface Props {
  searchParams: Promise<{ status?: string; q?: string }>
}

export default async function AdminSuppliersPage({ searchParams }: Props) {
  const { status, q } = await searchParams
  await requireSection('suppliers', 'read')

  // Service role: staff reads of this table go through the gate above, not
  // through a permissive client policy (section 7 rule 3).
  const admin = createAdminClient()

  let query = admin
    .from('suppliers')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (status === 'active' || status === 'inactive') query = query.eq('status', status)
  if (q) query = query.ilike('name', likeContains(q))

  const [{ data: suppliersData }, { data: productRows }] = await Promise.all([
    query,
    admin.from('products').select('supplier_id').is('deleted_at', null),
  ])

  const suppliers = (suppliersData ?? []) as Supplier[]

  const productCounts = new Map<string, number>()
  for (const row of productRows ?? []) {
    if (!row.supplier_id) continue
    productCounts.set(row.supplier_id, (productCounts.get(row.supplier_id) ?? 0) + 1)
  }

  const rows = suppliers
    .map((s) => ({ supplier: s, readiness: supplierReadiness(s) }))
    .filter((r) => (status === 'incomplete' ? !r.readiness.ready : true))

  const incompleteCount = suppliers.filter((s) => !supplierReadiness(s).ready).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ספקים</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            הטבלה שמוצרים, שורות הזמנה ושוברים מצביעים עליה. עריכה כאן מופיעה בעמוד המוצר.
          </p>
        </div>
        <Link
          href="/admin/suppliers/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-primary-hover text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          ספק חדש
        </Link>
      </div>

      {incompleteCount > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-900 text-sm rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            ל-{incompleteCount} ספקים חסרים פרטי חובה (שם, טלפון, כתובת, לוגו). מוצרים המשויכים
            אליהם לא יוכלו לעבור לסטטוס פעיל.
          </span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/suppliers?status=${f.value}` : '/admin/suppliers'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (status ?? '') === f.value
                ? 'bg-brand text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form method="GET" action="/admin/suppliers" className="me-auto">
          <input
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium text-start">שם העסק</th>
              <th className="px-5 py-3 font-medium text-start">טלפון</th>
              <th className="px-5 py-3 font-medium text-start">עיר</th>
              <th className="px-5 py-3 font-medium text-start">מוצרים</th>
              <th className="px-5 py-3 font-medium text-start">מוכן לפרסום</th>
              <th className="px-5 py-3 font-medium text-start">סטטוס</th>
              <th className="px-5 py-3 font-medium text-start">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ supplier, readiness }) => (
              <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/suppliers/${supplier.id}`}
                    className="text-brand hover:underline font-medium"
                  >
                    {supplier.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-600" dir="ltr">
                  {supplier.contact_phone ?? '—'}
                </td>
                <td className="px-5 py-3 text-gray-600">{supplier.city ?? '—'}</td>
                <td className="px-5 py-3 text-gray-700" dir="ltr">
                  {productCounts.get(supplier.id) ?? 0}
                </td>
                <td className="px-5 py-3">
                  {readiness.ready ? (
                    <span className="inline-flex items-center gap-1 text-green-700 text-xs">
                      <CheckCircle2 size={14} />
                      שלם
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                      <AlertTriangle size={14} />
                      חסר: {readiness.missingLabels.join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge
                    label={supplier.status === 'active' ? 'פעיל' : 'לא פעיל'}
                    variant={supplier.status === 'active' ? 'green' : 'gray'}
                  />
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/suppliers/${supplier.id}`}
                    className="text-brand text-sm hover:underline"
                  >
                    עריכה
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין ספקים להצגה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
