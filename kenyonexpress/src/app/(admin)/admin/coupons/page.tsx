import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { softDeleteCouponDeal } from '@/server/actions/admin/coupon-deals'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'עסקאות קופון' }

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'active', label: 'פעיל' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'paused', label: 'מושהה' },
  { value: 'archived', label: 'ארכיון' },
]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminCouponsPage({ searchParams }: Props) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('coupon_deals')
    .select(
      'id, title_he, business_name, original_price, platform_price, status, valid_until, created_at, vendors(business_name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data: deals } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">עסקאות קופון</h1>
        <Link
          href="/admin/coupons/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          עסקה חדשה
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/coupons?status=${f.value}` : '/admin/coupons'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (status ?? '') === f.value
                ? 'bg-brand text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">כותרת</th>
              <th className="px-5 py-3 font-medium">עסק</th>
              <th className="px-5 py-3 font-medium">מחיר מקורי</th>
              <th className="px-5 py-3 font-medium">מחיר פלטפורם</th>
              <th className="px-5 py-3 font-medium">תוקף עד</th>
              <th className="px-5 py-3 font-medium">סטטוס</th>
              <th className="px-5 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(deals ?? []).map((deal) => {
              const badge = productStatusBadge(
                deal.status as 'draft' | 'active' | 'paused' | 'archived',
              )
              return (
                <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/coupons/${deal.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      {deal.title_he}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{deal.business_name}</td>
                  <td className="px-5 py-3 text-gray-700">₪{deal.original_price}</td>
                  <td className="px-5 py-3 text-brand font-semibold">
                    ₪{deal.platform_price ?? (deal.original_price * 0.1).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {deal.valid_until
                      ? new Date(deal.valid_until).toLocaleDateString('he-IL')
                      : 'ללא הגבלה'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/coupons/${deal.id}`}
                        className="text-brand text-sm hover:underline"
                      >
                        עריכה
                      </Link>
                      <DeleteButton onConfirm={() => softDeleteCouponDeal(deal.id)} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {!deals?.length && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין עסקאות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
