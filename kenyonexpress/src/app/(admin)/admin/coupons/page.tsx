import StatusBadge from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'קופונים' }

const COUPON_STATUS_MAP: Record<string, { label: string; variant: 'green' | 'gray' | 'red' }> = {
  active: { label: 'פעיל', variant: 'green' },
  redeemed: { label: 'מומש', variant: 'gray' },
  expired: { label: 'פג תוקף', variant: 'red' },
}

export default async function AdminCouponsPage() {
  const supabase = await createClient()
  const { data: coupons } = await supabase
    .from('coupons')
    .select(
      'id, code, status, expiry_date, created_at, products(name_he), profiles(full_name, email)',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">קופונים</h1>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">קוד</th>
              <th className="px-5 py-3 font-medium">מוצר</th>
              <th className="px-5 py-3 font-medium">לקוח</th>
              <th className="px-5 py-3 font-medium">תוקף</th>
              <th className="px-5 py-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(coupons ?? []).map((coupon) => {
              const product = Array.isArray(coupon.products) ? coupon.products[0] : coupon.products
              const profile = Array.isArray(coupon.profiles) ? coupon.profiles[0] : coupon.profiles
              const badge = COUPON_STATUS_MAP[coupon.status] ?? {
                label: coupon.status,
                variant: 'gray' as const,
              }
              return (
                <tr key={coupon.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">{coupon.code}</td>
                  <td className="px-5 py-3 text-gray-700">{product?.name_he ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {profile?.full_name ?? profile?.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {coupon.expiry_date
                      ? new Date(coupon.expiry_date).toLocaleDateString('he-IL')
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </td>
                </tr>
              )
            })}
            {!coupons?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  אין קופונים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
