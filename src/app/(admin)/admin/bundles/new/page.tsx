import BundleForm from '@/components/admin/BundleForm'
import { requireSection } from '@/lib/admin/rbac'
import { listBundleProductOptions } from '@/lib/bundles/admin-read'

export const metadata = { title: 'חבילה חדשה' }

export default async function NewBundlePage() {
  await requireSection('discounts', 'write')
  const products = await listBundleProductOptions()
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">חבילה חדשה</h1>
      <BundleForm products={products} />
    </div>
  )
}
