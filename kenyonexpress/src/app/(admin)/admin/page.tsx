import StatsCard from '@/components/admin/StatsCard'
import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { Package, ShoppingCart, Store, Users } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'לוח בקרה' }

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const [
    { count: productCount },
    { count: vendorCount },
    { count: orderCount },
    { count: userCount },
    { data: recentOrders },
    { data: recentProducts },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('vendors').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('orders')
      .select('id, order_number, status, total, created_at, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('products')
      .select('id, name_he, status, base_price, vendors(business_name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">לוח בקרה</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="מוצרים" value={productCount ?? 0} icon={Package} />
        <StatsCard label="ספקים" value={vendorCount ?? 0} icon={Store} />
        <StatsCard label="הזמנות" value={orderCount ?? 0} icon={ShoppingCart} />
        <StatsCard label="משתמשים" value={userCount ?? 0} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">הזמנות אחרונות</h2>
            <Link href="/admin/orders" className="text-xs text-brand hover:underline">
              הצג הכל
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 font-medium">מס׳</th>
                <th className="px-5 py-2.5 font-medium">לקוח</th>
                <th className="px-5 py-2.5 font-medium">סכום</th>
                <th className="px-5 py-2.5 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(recentOrders ?? []).map((order) => {
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
                  </tr>
                )
              })}
              {!recentOrders?.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-gray-400 text-sm">
                    אין הזמנות עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent products */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">מוצרים אחרונים</h2>
            <Link href="/admin/products" className="text-xs text-brand hover:underline">
              הצג הכל
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 font-medium">שם</th>
                <th className="px-5 py-2.5 font-medium">ספק</th>
                <th className="px-5 py-2.5 font-medium">מחיר</th>
                <th className="px-5 py-2.5 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(recentProducts ?? []).map((product) => {
                const vendor = Array.isArray(product.vendors) ? product.vendors[0] : product.vendors
                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-brand hover:underline"
                      >
                        {product.name_he}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">
                      {vendor?.business_name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      ₪{product.base_price.toLocaleString('he-IL')}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        label={
                          product.status === 'active'
                            ? 'פעיל'
                            : product.status === 'draft'
                              ? 'טיוטה'
                              : product.status
                        }
                        variant={product.status === 'active' ? 'green' : 'gray'}
                      />
                    </td>
                  </tr>
                )
              })}
              {!recentProducts?.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-gray-400 text-sm">
                    אין מוצרים עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
