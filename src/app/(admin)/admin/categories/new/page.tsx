import CategoryForm from '@/components/admin/CategoryForm'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'קטגוריה חדשה' }

export default async function NewCategoryPage() {
  await requireAdminPage()
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name_he')
    .eq('is_active', true)
    .order('name_he')

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">קטגוריה חדשה</h1>
      <CategoryForm parentOptions={categories ?? []} />
    </div>
  )
}
