import { requireSupplierRole } from '@/lib/supplier/rbac'
import { redirect } from 'next/navigation'
import SupplierProductForm from './SupplierProductForm'

export const metadata = { title: 'מוצר חדש | Kenyon Express' }

export default async function SupplierNewProductPage() {
  const supplier = await requireSupplierRole('owner')

  if (!supplier) {
    redirect('/supplier/access-denied')
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">מוצר חדש</h1>
        <p className="text-sm text-gray-600 mt-1">המוצר ישלח לאישור מנהל לפני פרסום באתר</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SupplierProductForm supplierId={supplier.supplierId} />
      </div>
    </div>
  )
}
