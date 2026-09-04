import ProductForm, { type SupplierOption } from '@/components/admin/ProductForm'
import { requireSection } from '@/lib/admin/rbac'
import { excludeDeleted } from '@/lib/soft-delete'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'מוצר חדש' }

export default async function NewProductPage() {
  // Layer 3 of the four-layer guard. Without it the panel layout alone lets a
  // support user (catalog access: none) open the catalog editor.
  await requireSection('catalog', 'write')

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: categories }, { data: suppliers }] = await Promise.all([
    excludeDeleted(
      supabase.from('categories').select('id, name_he').eq('is_active', true),
      'categories',
    ).order('name_he'),
    admin
      .from('suppliers')
      .select('id, name, contact_phone, address, logo_url, status')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">מוצר חדש</h1>
      <ProductForm
        categories={categories ?? []}
        suppliers={(suppliers ?? []) as SupplierOption[]}
      />
    </div>
  )
}
