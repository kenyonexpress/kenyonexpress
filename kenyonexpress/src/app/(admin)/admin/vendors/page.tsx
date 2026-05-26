import StatusBadge, { vendorStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata = { title: 'ספקים' }

export default async function AdminVendorsPage() {
  const supabase = await createClient()
  const { data: vendors } = await supabase
    .from('vendors')
    .select('*, profiles(full_name, email)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">ספקים</h1>

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
                      href={`/admin/vendors/${vendor.id}`}
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
                      href={`/admin/vendors/${vendor.id}`}
                      className="text-brand text-sm hover:underline"
                    >
                      פרטים
                    </Link>
                  </td>
                </tr>
              )
            })}
            {!vendors?.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  אין ספקים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
