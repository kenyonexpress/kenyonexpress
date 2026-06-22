import StatusBadge, { vendorStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'ספקים' }

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'pending', label: 'ממתינים' },
  { value: 'active', label: 'פעילים' },
  { value: 'suspended', label: 'מושעים' },
]

interface Props {
  searchParams: Promise<{ status?: string; q?: string }>
}

export default async function AdminVendorsPage({ searchParams }: Props) {
  const { status, q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('vendors')
    .select('*, profiles(full_name, email)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('business_name', `%${q}%`)

  const { data: vendors } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ספקים</h1>
        <Link
          href="/admin/suppliers/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-[#fedd26] text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          ספק חדש
        </Link>
      </div>

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

        <form method="GET" action="/admin/suppliers" className="mr-auto">
          <input
            name="q"
            defaultValue={q}
            placeholder="חיפוש לפי שם..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">שם עסק</th>
              <th className="px-5 py-3 font-medium">ח.פ</th>
              <th className="px-5 py-3 font-medium">אימייל</th>
              <th className="px-5 py-3 font-medium">עמלה</th>
              <th className="px-5 py-3 font-medium">סטטוס</th>
              <th className="px-5 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(vendors ?? []).map((vendor) => {
              const badge = vendorStatusBadge(vendor.status)
              const profile = Array.isArray(vendor.profiles) ? vendor.profiles[0] : vendor.profiles
              return (
                <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/suppliers/${vendor.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      {vendor.business_name}
                    </Link>
                    {profile && (
                      <div className="text-xs text-gray-400">
                        {profile.full_name ?? profile.email}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">
                    {vendor.business_id}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{vendor.contact_email}</td>
                  <td className="px-5 py-3 text-gray-700">{vendor.commission_rate}%</td>
                  <td className="px-5 py-3">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/suppliers/${vendor.id}`}
                      className="text-brand text-sm hover:underline"
                    >
                      עריכה
                    </Link>
                  </td>
                </tr>
              )
            })}
            {!vendors?.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  אין ספקים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
