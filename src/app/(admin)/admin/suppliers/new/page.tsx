import SupplierForm from '@/components/admin/SupplierForm'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'ספק חדש' }

export default async function NewSupplierPage() {
  await requireSection('suppliers', 'write')

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">ספק חדש</h1>
      <p className="text-sm text-gray-500">
        שם, טלפון, כתובת ולוגו נדרשים כדי שמוצר של הספק יוכל להתפרסם. אפשר לשמור בלעדיהם ולהשלים אחר
        כך.
      </p>
      <SupplierForm />
    </div>
  )
}
