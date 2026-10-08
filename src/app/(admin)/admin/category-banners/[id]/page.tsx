import CategoryBannerForm from '@/components/admin/CategoryBannerForm'
import { requireSection } from '@/lib/admin/rbac'
import {
  STATS_WINDOW_DAYS,
  listCategoryOptions,
  readCategoryBannerForAdmin,
} from '@/lib/category-banners/admin-read'
import { notFound } from 'next/navigation'

export default async function EditCategoryBannerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSection('catalog', 'write')
  const { id } = await params
  const [banner, categories] = await Promise.all([
    readCategoryBannerForAdmin(id),
    listCategoryOptions(),
  ])
  if (!banner) notFound()

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">{banner.title_he}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {banner.impressions} חשיפות ו-{banner.clicks} קליקים ב-{STATS_WINDOW_DAYS} הימים האחרונים
          {banner.ctr === null ? '' : ` (יחס ${banner.ctr}%)`}. שינוי בחלון או בעדיפות נכנס לתוקף עם
          הבקשה הבאה לעמוד הקטגוריה.
        </p>
      </header>
      <CategoryBannerForm initial={banner} categories={categories} />
    </div>
  )
}
