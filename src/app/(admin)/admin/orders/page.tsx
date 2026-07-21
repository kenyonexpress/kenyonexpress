import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata = { title: 'הזמנות' }

const ORDER_STATUSES = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'pending', label: 'ממתין' },
  { value: 'paid', label: 'שולם' },
  { value: 'partially_fulfilled', label: 'סופק חלקית' },
  { value: 'fulfilled', label: 'סופק' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'refunded', label: 'הוחזר' },
]

interface Props {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const { status, from, to } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select('id, invoice_number, status, total_ils, created_at, profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', `${to}T23:59:59`)

  const { data: orders } = await query

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">הזמנות</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={s.value ? `/admin/orders?status=${s.value}` : '/admin/orders'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (status ?? '') === s.value
                ? 'bg-brand text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {s.label}
          </Link>
        ))}
        <form method="GET" action="/admin/orders" className="flex gap-2 mr-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <input
            name="to"
            type="date"
            defaultValue={to ?? ''}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            סינון
          </button>
        </form>
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
                      {order.invoice_number ?? order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {profile?.full_name ?? profile?.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{order.total_ils.toLocaleString('he-IL')}
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
