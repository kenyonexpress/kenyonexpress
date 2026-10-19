import { PRODUCT_CSV_COLUMNS } from '@/lib/admin/product-csv'
import { requireAdminSession } from '@/lib/admin/rbac'
import ImportForm from './ImportForm'

export const metadata = { title: 'ייבוא מוצרים מ-CSV' }

export default async function ImportProductsPage() {
  await requireAdminSession()
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">ייבוא מוצרים מ-CSV</h1>
      <p className="text-sm text-gray-600">
        המוצרים נוצרים כטיוטה. עמודות חובה: slug, name_he, type, kenyon_price. עמודות נתמכות:{' '}
        <span dir="ltr">{PRODUCT_CSV_COLUMNS.join(', ')}</span>. עד 200 שורות בקובץ.
      </p>
      <ImportForm />
    </div>
  )
}
