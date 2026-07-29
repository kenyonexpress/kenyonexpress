import DiscountCampaignForm from '@/components/admin/DiscountCampaignForm'
import { requireSection } from '@/lib/admin/rbac'
import { growthClient } from '@/lib/growth/client'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('discounts', 'write')
  const { id } = await params

  const { data } = await growthClient().campaigns().byId(id)
  if (!data) notFound()

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <p className="mt-1 font-mono text-sm text-gray-600" dir="ltr">
          {data.code}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          נוצל <bdi>{data.used_count}</bdi> פעמים. המונה מתוחזק על ידי{' '}
          <code>fn_claim_discount</code> ולא ניתן לעריכה כאן: כתיבה שלו מהטופס הייתה מחזירה בדיוק את
          מרוץ הקריאה-כתיבה שיומן המימושים קיים כדי למנוע.
        </p>
      </header>
      <DiscountCampaignForm initial={data} />
    </div>
  )
}
