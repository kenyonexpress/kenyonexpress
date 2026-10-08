import CategoryForm from '@/components/admin/CategoryForm'
import { requireSection } from '@/lib/admin/rbac'
import { getAdminCategoryGuide } from '@/lib/category-guides/admin-read'
import { excludeDeleted } from '@/lib/soft-delete'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת קטגוריה' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditCategoryPage({ params }: Props) {
  const { id } = await params
  await requireSection('catalog', 'write')
  const supabase = await createClient()

  const [{ data: category }, { data: categories }] = await Promise.all([
    supabase.from('categories').select('*').eq('id', id).single(),
    excludeDeleted(
      supabase.from('categories').select('id, name_he').eq('is_active', true),
      'categories',
    ).order('name_he'),
  ])

  if (!category) notFound()

  // The buyer guide (STEP 65): the row, else the authored text, on the
  // service role behind the gate above.
  const guide = await getAdminCategoryGuide({ id: category.id, slug: category.slug })

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת קטגוריה</h1>
      <CategoryForm category={category} parentOptions={categories ?? []} guide={guide} />
    </div>
  )
}
