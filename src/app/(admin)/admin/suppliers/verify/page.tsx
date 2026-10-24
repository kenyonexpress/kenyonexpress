import StatusBadge from '@/components/admin/StatusBadge'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { likeContains } from '@/lib/utils/search-escape'
import type { Supplier } from '@/types/database'
import { Check, Clock, X } from 'lucide-react'
import Link from 'next/link'
import { updateSupplierVerificationAction } from './actions'

export const metadata = { title: 'אימות ספקים' }

/**
 * Supplier verification admin page.
 * Allows admins to verify, reject, or mark suppliers as pending verification.
 */

const VERIFICATION_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'unverified', label: 'לא מאומת' },
  { value: 'pending', label: 'ממתין' },
  { value: 'verified', label: 'מאומת' },
]

interface Props {
  searchParams: Promise<{ verification?: string; q?: string }>
}

export default async function AdminSuppliersVerifyPage({ searchParams }: Props) {
  const { verification, q } = await searchParams
  await requireSection('suppliers', 'write')

  const admin = createAdminClient()

  let query = admin
    .from('suppliers')
    .select('*, verified_by_user:verified_by(email)')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (verification && ['unverified', 'pending', 'verified'].includes(verification)) {
    query = query.eq('verification_status', verification)
  }
  if (q) query = query.ilike('name', likeContains(q))

  const { data: suppliersData } = await query

  const suppliers = (suppliersData ?? []) as Array<
    Supplier & { verified_by_user?: { email: string } | null }
  >

  const stats = {
    unverified: suppliers.filter((s) => s.verification_status === 'unverified').length,
    pending: suppliers.filter((s) => s.verification_status === 'pending').length,
    verified: suppliers.filter((s) => s.verification_status === 'verified').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">אימות ספקים</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            אימות ספקים מוצג כתג על כרטיסי מוצרים. ספקים מאומתים מקבלים תג כחול.
          </p>
        </div>
        <Link href="/admin/suppliers" className="text-brand text-sm hover:underline font-medium">
          ← רשימת ספקים
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="text-amber-900 text-sm font-medium">לא מאומת</div>
          <div className="text-amber-900 text-2xl font-bold mt-1">{stats.unverified}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-blue-900 text-sm font-medium">ממתין</div>
          <div className="text-blue-900 text-2xl font-bold mt-1">{stats.pending}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <div className="text-green-900 text-sm font-medium">מאומת</div>
          <div className="text-green-900 text-2xl font-bold mt-1">{stats.verified}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {VERIFICATION_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={
              f.value
                ? `/admin/suppliers/verify?verification=${f.value}`
                : '/admin/suppliers/verify'
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (verification ?? '') === f.value
                ? 'bg-brand text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form method="GET" action="/admin/suppliers/verify" className="me-auto">
          <input
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם..."
            aria-label="חיפוש לפי שם"
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
              <th className="px-5 py-3 font-medium text-start">סטטוס אימות</th>
              <th className="px-5 py-3 font-medium text-start">אומת על ידי</th>
              <th className="px-5 py-3 font-medium text-start">תאריך אימות</th>
              <th className="px-5 py-3 font-medium text-start">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {suppliers.map((supplier) => (
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
                <td className="px-5 py-3">
                  {supplier.verification_status === 'verified' && (
                    <StatusBadge label="מאומת" variant="green" />
                  )}
                  {supplier.verification_status === 'pending' && (
                    <StatusBadge label="ממתין" variant="blue" />
                  )}
                  {supplier.verification_status === 'unverified' && (
                    <StatusBadge label="לא מאומת" variant="gray" />
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600 text-xs">
                  {supplier.verified_by_user?.email ?? '—'}
                </td>
                <td className="px-5 py-3 text-gray-600 text-xs" dir="ltr">
                  {supplier.verified_at
                    ? new Date(supplier.verified_at).toLocaleDateString('he-IL')
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <form action={updateSupplierVerificationAction}>
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <input type="hidden" name="status" value="verified" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-green-700 hover:text-green-900 text-xs font-medium transition-colors"
                        aria-label="אשר"
                        title="אשר"
                      >
                        <Check size={14} />
                        אשר
                      </button>
                    </form>
                    <form action={updateSupplierVerificationAction}>
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <input type="hidden" name="status" value="pending" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 text-xs font-medium transition-colors"
                        aria-label="ממתין"
                        title="סמן כממתין"
                      >
                        <Clock size={14} />
                        ממתין
                      </button>
                    </form>
                    <form action={updateSupplierVerificationAction}>
                      <input type="hidden" name="supplier_id" value={supplier.id} />
                      <input type="hidden" name="status" value="unverified" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 text-xs font-medium transition-colors"
                        aria-label="בטל אימות"
                        title="בטל אימות"
                      >
                        <X size={14} />
                        בטל
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
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
