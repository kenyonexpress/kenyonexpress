import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata = { title: 'הזמנות' }

const ORDER_STATUSES = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'pending', label: 'ממתין' },
  { value: 'paid', label: 'שולם' },
  { value: 'processing', label: 'בטיפול' },
  { value: 'shipped', label: 'נשלח' },
  { value: 'delivered', label: 'נמסר' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'refunded', label: 'הוחזר' },
]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select('id, order_number, status, total, created_at, profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (status) query = query.eq('status', status)

  const { data: orders } = await query

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">הזמנות</h1>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={s.value ? `/admin/orders?status=${s.value}` : '/admin/orders'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (status ?? '') === s.value
                ? 'bg-brand text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">מס׳ הזמנה</th>
              <th className="px-5 py-3 font-medium">לקוח</th>
              <th className="px-5 py-3 font-medium">סכום</th>
              <th className="px-5 py-3 font-medium">סטטוס</th>
              <th className="px-5 py-3 font-medium">תאריך</th>
              <th className="px-5 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(orders ?? []).map((order) => {
              const badge = orderStatusBadge(order.status)
              const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles
              return (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-brand hover:underline font-mono text-xs"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {profile?.full_name ?? profile?.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{order.total.toLocaleString('he-IL')}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(order.created_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-brand text-sm hover:underline"
                    >
                      פרטים
                    </Link>
                  </td>
                </tr>
              )
            })}
            {!orders?.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  אין הזמנות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
