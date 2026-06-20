import CategoriesTable, { type CategoryRow } from '@/components/admin/CategoriesTable'
import { categoryListParamsSchema } from '@/lib/admin/page-params'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'קטגוריות' }

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminCategoriesPage({ searchParams }: Props) {
  const raw = await searchParams
  const parsed = categoryListParamsSchema.safeParse({
    new: raw.new === '1' ? '1' : undefined,
    edit: typeof raw.edit === 'string' ? raw.edit : undefined,
  })

  const params = parsed.success ? parsed.data : {}
  const { new: isNew, edit } = params

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order')
    .order('name_he')

  const active = categories ?? []
  const nameById = new Map(active.map((c) => [c.id, c.name_he]))

  let editingCategory = undefined
  if (edit) {
    editingCategory = active.find((c) => c.id === edit)
    if (!editingCategory) notFound()
  }

  const rows: CategoryRow[] = active.map((c) => ({
    id: c.id,
    name_he: c.name_he,
    slug: c.slug,
    parent_name: c.parent_id ? (nameById.get(c.parent_id) ?? null) : null,
    sort_order: c.sort_order,
    is_active: c.is_active,
  }))

  const parentOptions = active.map((c) => ({ id: c.id, name_he: c.name_he }))

  return (
    <CategoriesTable
      rows={rows}
      categories={active}
      parentOptions={parentOptions}
      editingCategory={editingCategory}
      showNewForm={Boolean(isNew)}
    />
  )
}
