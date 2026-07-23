import CouponDealForm from '@/components/admin/CouponDealForm'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת עסקה' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditCouponDealPage({ params }: Props) {
  const { id } = await params
  await requireAdminPage()
  const supabase = await createClient()

  const [{ data: deal }, { data: vendors }] = await Promise.all([
    supabase.from('coupon_deals').select('*').eq('id', id).single(),
    supabase
      .from('vendors')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name'),
  ])

  if (!deal) notFound()

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">עריכת עסקה — {deal.title_he}</h1>
      <CouponDealForm deal={deal} vendors={vendors ?? []} />
    </div>
  )
}
