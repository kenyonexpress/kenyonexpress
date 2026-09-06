import CategoryForm from '@/components/admin/CategoryForm'
import { requireAdminPage } from '@/lib/admin/rbac'
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

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת קטגוריה</h1>
      <CategoryForm category={category} parentOptions={categories ?? []} />
    </div>
  )
}
