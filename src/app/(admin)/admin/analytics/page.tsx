import StatsCard from '@/components/admin/StatsCard'
import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { Coins, ShoppingCart, TrendingUp, Users } from 'lucide-react'

export const metadata = { title: 'אנליטיקה' }

// Analytics views (033/034) are not applied to the live DB, so this screen
// computes its aggregates server-side from raw live tables (decision D9).
// It migrates to the v_* views when those land.

const REVENUE_STATUSES = ['paid', 'partially_fulfilled', 'fulfilled'] as const

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export default async function AdminAnalyticsPage() {
  await requireSection('analytics')

  const supabase = await createClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceIso = since.toISOString()

  const [
    { data: paidOrders },
    { count: newCustomers },
    { count: couponsIssued },
    { count: couponsUsed },
    { count: couponsExpired },
    { data: items },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total_ils, created_at, status')
      .in('status', [...REVENUE_STATUSES])
      .is('deleted_at', null)
      .gte('created_at', sinceIso),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso),
    supabase.from('coupon_codes').select('id', { count: 'exact', head: true }),
    supabase.from('coupon_codes').select('id', { count: 'exact', head: true }).eq('status', 'used'),
    supabase
      .from('coupon_codes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'expired'),
    supabase
      .from('order_items')
      .select('product_id, quantity, total_price_ils, products(name_he)')
      .is('deleted_at', null)
      .gte('created_at', sinceIso)
      .limit(500),
  ])

  const orders = paidOrders ?? []
  const revenue = orders.reduce((sum, o) => sum + o.total_ils, 0)
  const avgOrder = orders.length ? revenue / orders.length : 0

  // Revenue per day, newest first.
  const byDay = new Map<string, { revenue: number; orders: number }>()
  for (const order of orders) {
    const key = dayKey(order.created_at)
    const entry = byDay.get(key) ?? { revenue: 0, orders: 0 }
    entry.revenue += order.total_ils
    entry.orders += 1
    byDay.set(key, entry)
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const maxDayRevenue = Math.max(1, ...days.map(([, d]) => d.revenue))

  // Top products by revenue.
  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const item of items ?? []) {
    if (!item.product_id) continue
    const product = Array.isArray(item.products) ? item.products[0] : item.products
    const entry = byProduct.get(item.product_id) ?? {
      name: product?.name_he ?? item.product_id.slice(0, 8),
      qty: 0,
      revenue: 0,
    }
    entry.qty += item.quantity
    entry.revenue += item.total_price_ils
    byProduct.set(item.product_id, entry)
  }
  const topProducts = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  const issued = couponsIssued ?? 0
  const used = couponsUsed ?? 0
  const scanRate = issued ? Math.round((used / issued) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">אנליטיקה</h1>
        <p className="mt-1 text-sm text-black/50">30 הימים האחרונים, מחושב ישירות מהנתונים החיים</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard
          variant="admin"
          icon={Coins}
          label="הכנסות (ברוטו)"
          value={`₪${revenue.toLocaleString('he-IL')}`}
        />
        <StatsCard
          variant="admin"
          icon={ShoppingCart}
          label="הזמנות ששולמו"
          value={orders.length.toLocaleString('he-IL')}
        />
        <StatsCard
          variant="admin"
          icon={TrendingUp}
          label="שווי הזמנה ממוצע"
          value={`₪${avgOrder.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`}
        />
        <StatsCard
          variant="admin"
          icon={Users}
          label="לקוחות חדשים"
          value={(newCustomers ?? 0).toLocaleString('he-IL')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-black/10 bg-white">
          <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
            הכנסות לפי יום
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.02] text-end text-xs text-black/50">
                <th className="px-5 py-2.5 font-medium">יום</th>
                <th className="px-5 py-2.5 font-medium">הזמנות</th>
                <th className="w-1/2 px-5 py-2.5 font-medium">הכנסה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {days.map(([day, data]) => (
                <tr key={day}>
                  <td className="whitespace-nowrap px-5 py-2 text-xs text-black/60">
                    {new Date(day).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-5 py-2 text-xs">{data.orders.toLocaleString('he-IL')}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                        <div
                          className="h-full rounded-full bg-[#fed700]"
                          style={{ width: `${Math.round((data.revenue / maxDayRevenue) * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 text-end text-xs">
                        ₪{data.revenue.toLocaleString('he-IL')}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!days.length && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-black/40">
                    אין הזמנות בתקופה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-black/10 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">משפך קופונים (כל הזמן)</h2>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-[#333e48]">{issued.toLocaleString('he-IL')}</p>
                <p className="text-xs text-black/50">הונפקו</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-700">{used.toLocaleString('he-IL')}</p>
                <p className="text-xs text-black/50">מומשו</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-500">
                  {(couponsExpired ?? 0).toLocaleString('he-IL')}
                </p>
                <p className="text-xs text-black/50">פגי תוקף</p>
              </div>
              <div>
                <p className="text-lg font-bold text-[#333e48]">{scanRate}%</p>
                <p className="text-xs text-black/50">אחוז מימוש</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-white">
            <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
              מוצרים מובילים (הכנסה)
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-black/5">
                {topProducts.map((product) => (
                  <tr key={product.name}>
                    <td className="max-w-64 truncate px-5 py-2">{product.name}</td>
                    <td className="px-5 py-2 text-xs text-black/50">
                      {product.qty.toLocaleString('he-IL')} יח׳
                    </td>
                    <td className="px-5 py-2 text-end font-medium">
                      ₪{product.revenue.toLocaleString('he-IL')}
                    </td>
                  </tr>
                ))}
                {!topProducts.length && (
                  <tr>
                    <td className="px-5 py-8 text-center text-sm text-black/40">אין נתונים</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}
