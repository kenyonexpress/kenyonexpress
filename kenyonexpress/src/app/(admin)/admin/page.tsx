import StatsCard from '@/components/admin/StatsCard'
import { createClient } from '@/lib/supabase/server'
import { FileText, Package, Tag, Users } from 'lucide-react'

export const metadata = { title: 'לוח בקרה' }

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const [
    { count: productCount },
    { count: couponCount },
    { count: categoryCount },
    { count: userCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('coupon_deals').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#000000]">לוח בקרה</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard label="מוצרים" value={productCount ?? 0} icon={Package} variant="admin" />
        <StatsCard label="קופונים" value={couponCount ?? 0} icon={FileText} variant="admin" />
        <StatsCard label="קטגוריות" value={categoryCount ?? 0} icon={Tag} variant="admin" />
        <StatsCard label="משתמשים" value={userCount ?? 0} icon={Users} variant="admin" />
      </div>
    </div>
  )
}
