import ProductImportClient from '@/components/admin/ProductImportClient'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'ייבוא מוצרים' }

export default async function ProductImportPage() {
  // Same layer-3 guard as the product editor: importing creates catalog rows,
  // so panel entry alone (which support has) is not enough.
  await requireSection('catalog', 'write')

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">ייבוא מוצרים מקובץ CSV</h1>
      <ProductImportClient />
    </div>
  )
}
