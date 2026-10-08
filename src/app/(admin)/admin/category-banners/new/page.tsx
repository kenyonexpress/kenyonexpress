import CategoryBannerForm from '@/components/admin/CategoryBannerForm'
import { requireSection } from '@/lib/admin/rbac'
import { listCategoryOptions } from '@/lib/category-banners/admin-read'

export const metadata = { title: 'באנר חדש לקטגוריה' }

export default async function NewCategoryBannerPage() {
  await requireSection('catalog', 'write')
  const categories = await listCategoryOptions()
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">באנר חדש לקטגוריה</h1>
      <CategoryBannerForm categories={categories} />
    </div>
  )
}
