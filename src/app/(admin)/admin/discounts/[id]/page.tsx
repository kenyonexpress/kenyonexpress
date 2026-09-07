import CouponQrBatchForm from '@/components/admin/CouponQrBatchForm'
import DiscountCampaignForm from '@/components/admin/DiscountCampaignForm'
import { requireSection } from '@/lib/admin/rbac'
import { growthClient } from '@/lib/growth/client'
import { notFound } from 'next/navigation'

export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('discounts', 'write')
  const { id } = await params

  const growth = growthClient()
  const { data } = await growth.campaigns().byId(id)
  if (!data) notFound()

  const { data: batches } = await growth.qrBatches().listForCampaign(id)

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

      <section className="max-w-2xl space-y-4 border-t pt-6">
        <header>
          <h2 className="text-lg font-bold">קבוצות QR להדפסה</h2>
          <p className="mt-1 text-sm text-gray-600">
            כל קבוצה היא סדרה של קודים בני 8 ספרות, חד-פעמיים, שמתנהגים בקופה בדיוק כמו הקוד של
            הקמפיין. ה-PDF מכיל QR לכל קוד, מוכן לגזירה.
          </p>
        </header>

        <CouponQrBatchForm campaignId={id} />

        {batches && batches.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-gray-600">
                <th className="py-2 text-start font-medium">תיאור</th>
                <th className="py-2 text-start font-medium">כמות</th>
                <th className="py-2 text-start font-medium">נוצרה</th>
                <th className="py-2 text-start font-medium">קובץ</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b last:border-0">
                  <td className="py-2">{batch.label}</td>
                  <td className="py-2">
                    <bdi>{batch.quantity}</bdi>
                  </td>
                  <td className="py-2">
                    {new Date(batch.created_at).toLocaleDateString('he-IL', {
                      dateStyle: 'medium',
                    })}
                  </td>
                  <td className="py-2">
                    <a
                      href={`/api/admin/coupon-qr/${batch.id}/pdf`}
                      className="font-medium text-blue-700 underline"
                    >
                      הורדת PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">עוד אין קבוצות לקמפיין הזה.</p>
        )}
      </section>
    </div>
  )
}
