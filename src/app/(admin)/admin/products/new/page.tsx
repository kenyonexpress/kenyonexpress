import ProductForm, { type SupplierOption } from '@/components/admin/ProductForm'
import DealWizard from '@/components/admin/deal-wizard/DealWizard'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import type { DealTemplate } from '@/lib/deal-templates/common'
import { excludeDeleted } from '@/lib/soft-delete'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'מוצר חדש' }

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  // Layer 3 of the four-layer guard. Without it the panel layout alone lets a
  // support user (catalog access: none) open the catalog editor.
  const session = await requireSection('catalog', 'write')
  const { mode } = await searchParams

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: categories }, { data: suppliers }, { data: templates }] = await Promise.all([
    excludeDeleted(
      supabase.from('categories').select('id, name_he, slug').eq('is_active', true),
      'categories',
    ).order('name_he'),
    admin
      .from('suppliers')
      .select('id, name, contact_phone, address, logo_url, status')
      .is('deleted_at', null)
      .order('name'),
    // C148 deal master templates (migration 328).
    admin
      .from('deal_templates' as never)
      .select(
        'slug, name_he, product_type, category_slug, fields, defaults, is_system, parent_slug',
      )
      .is('deleted_at', null)
      .order('name_he'),
  ])

  // The full, template-free editor stays one click away (and is the fallback
  // until 328 is applied somewhere the table does not exist yet).
  if (mode === 'classic' || !templates || (templates as unknown[]).length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-xl font-bold text-gray-900">מוצר חדש</h1>
        <ProductForm
          categories={categories ?? []}
          suppliers={(suppliers ?? []) as SupplierOption[]}
          hidePricing={!canSeeMoney(session.role)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-[1320px]">
      <h1 className="text-xl font-bold text-gray-900">דיל חדש</h1>
      <DealWizard
        templates={templates as unknown as DealTemplate[]}
        categories={categories ?? []}
        suppliers={(suppliers ?? []) as SupplierOption[]}
        canPublish={canSeeMoney(session.role)}
      />
    </div>
  )
}
