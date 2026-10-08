import FlashSaleForm from '@/components/admin/FlashSaleForm'
import { requireSection } from '@/lib/admin/rbac'
import { listBundleProductOptions } from '@/lib/bundles/admin-read'

export const metadata = { title: 'מבצע בזק חדש' }

export default async function NewFlashSalePage() {
  await requireSection('discounts', 'write')
  // The same picker the bundle composer uses: active products with their
  // current price, which is what the flash price is judged against.
  const products = await listBundleProductOptions()
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">מבצע בזק חדש</h1>
      <FlashSaleForm products={products} />
    </div>
  )
}
