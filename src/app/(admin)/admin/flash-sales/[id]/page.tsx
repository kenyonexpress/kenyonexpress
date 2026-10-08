import FlashSaleForm from '@/components/admin/FlashSaleForm'
import { requireSection } from '@/lib/admin/rbac'
import { listBundleProductOptions } from '@/lib/bundles/admin-read'
import { readFlashSaleForAdmin } from '@/lib/flash-sales/admin-read'
import { notFound } from 'next/navigation'

export default async function EditFlashSalePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('discounts', 'write')
  const { id } = await params
  const [sale, products] = await Promise.all([
    readFlashSaleForAdmin(id),
    listBundleProductOptions(),
  ])
  if (!sale) notFound()

  // A product that is no longer active is kept in the picker so the admin can
  // see what the sale points at; the picker itself offers active products only.
  const options = products.some((p) => p.id === sale.product_id)
    ? products
    : [
        ...products,
        {
          id: sale.product_id,
          name_he: sale.product_name_he ?? 'מוצר שאינו פעיל',
          kenyon_price: sale.product_kenyon_price,
          status: sale.product_status ?? 'inactive',
        },
      ]

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">{sale.name_he}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {sale.taken} מתוך {sale.allocation} יחידות תפוסות, {sale.queued} בחדר ההמתנה,{' '}
          {sale.consumed} נמכרו. שינוי בחלון או בכמות נכנס לתוקף מיד; הבאנר בדף הבית מתעדכן עם רענון
          הקטלוג.
        </p>
      </header>
      <FlashSaleForm initial={sale} products={options} />
    </div>
  )
}
