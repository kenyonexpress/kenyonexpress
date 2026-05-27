import CategoryTree from '@/components/admin/CategoryTree'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'קטגוריות' }

export default async function AdminCategoriesPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')
    .order('name_he')

  return <CategoryTree categories={categories ?? []} />
}
