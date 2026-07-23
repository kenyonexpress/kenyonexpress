import CouponDealForm from '@/components/admin/CouponDealForm'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'עסקה חדשה' }

export default async function NewCouponDealPage() {
  await requireAdminPage()
  const supabase = await createClient()
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, business_name')
    .eq('status', 'active')
    .order('business_name')

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">עסקת קופון חדשה</h1>
      <CouponDealForm vendors={vendors ?? []} />
    </div>
  )
}
