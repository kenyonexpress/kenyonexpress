import StatsCard from '@/components/admin/StatsCard'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { FileText, Package, ShoppingCart } from 'lucide-react'

export const metadata = { title: 'לוח בקרה' }

export default async function DashboardPage() {
  await requireAdminPage()
  const supabase = await createClient()

  const [{ count: productCount }, { count: orderCount }, { count: couponCount }] =
    await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase
        .from('coupon_deals')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null),
    ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#333e48]">לוח בקרה</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard label="מוצרים" value={productCount ?? 0} icon={Package} variant="admin" />
        <StatsCard label="הזמנות" value={orderCount ?? 0} icon={ShoppingCart} variant="admin" />
        <StatsCard label="קופונים" value={couponCount ?? 0} icon={FileText} variant="admin" />
      </div>
    </div>
  )
}
