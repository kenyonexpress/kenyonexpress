import BundleForm from '@/components/admin/BundleForm'
import { requireSection } from '@/lib/admin/rbac'
import { listBundleProductOptions, readBundleForAdmin } from '@/lib/bundles/admin-read'
import { notFound } from 'next/navigation'

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('discounts', 'write')
  const { id } = await params
  const [bundle, products] = await Promise.all([readBundleForAdmin(id), listBundleProductOptions()])
  if (!bundle) notFound()

  // A member that is no longer active is kept in the list so the admin can
  // see and remove it; the picker itself offers active products only.
  const options = [
    ...products,
    ...bundle.items
      .filter((i) => !products.some((p) => p.id === i.product_id))
      .map((i) => ({
        id: i.product_id,
        name_he: i.name_he ?? 'מוצר שאינו פעיל',
        kenyon_price: i.kenyon_price,
        status: i.status ?? 'inactive',
      })),
  ]

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">{bundle.name_he}</h1>
        <p className="mt-1 text-sm text-gray-600">
          השינוי נכנס לתוקף מיד בעגלה; דף המוצר מתעדכן עם רענון הקטלוג.
        </p>
      </header>
      <BundleForm initial={bundle} products={options} />
    </div>
  )
}
