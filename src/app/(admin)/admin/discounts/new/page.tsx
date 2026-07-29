import DiscountCampaignForm from '@/components/admin/DiscountCampaignForm'
import { requireSection } from '@/lib/admin/rbac'

export default async function NewDiscountPage() {
  await requireSection('discounts', 'write')
  return (
    <div dir="rtl" className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">קמפיין הנחה חדש</h1>
      <DiscountCampaignForm />
    </div>
  )
}
