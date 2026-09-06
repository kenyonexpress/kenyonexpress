import ProductForm, { type SupplierOption } from '@/components/admin/ProductForm'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { excludeDeleted } from '@/lib/soft-delete'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת מוצר' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  // Layer 3 of the four-layer guard: the panel layout gates entry, the section
  // matrix gates the section.
  const session = await requireSection('catalog', 'write')

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: product }, { data: categories }, { data: variants }, { data: suppliers }] =
    await Promise.all([
      // `.is('deleted_at', null)` LIKE THE TWO ROWS UNDER IT, AND IT WAS THE
      // ONLY READ HERE THAT DID NOT FILTER.
      //
      // A soft-deleted product opened this form as though nothing had happened:
      // same fields, same save button, no notice anywhere that the row is gone.
      // Saving from it writes to a deleted row - `upsertProduct` does not clear
      // `deleted_at`, so the product stays deleted and the edit simply never
      // appears on the storefront. Work that vanishes without an error.
      //
      // There is no restore flow to justify reaching it either: `products.ts`
      // has delete, bulk soft-delete and archive, and nothing that sets
      // `deleted_at` back to null. So a deleted id has no destination here and
      // now 404s, which is what the list already implies by not showing it.
      supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single(),
      excludeDeleted(
        supabase.from('categories').select('id, name_he').eq('is_active', true),
        'categories',
      ).order('name_he'),
      supabase.from('product_variants').select('*').eq('product_id', id).is('deleted_at', null),
      admin
        .from('suppliers')
        .select('id, name, contact_phone, address, logo_url, status')
        .is('deleted_at', null)
        .order('name'),
    ])

  if (!product) notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת מוצר</h1>
      <ProductForm
        product={product}
        variants={variants ?? []}
        categories={categories ?? []}
        suppliers={(suppliers ?? []) as SupplierOption[]}
        hidePricing={!canSeeMoney(session.role)}
      />
    </div>
  )
}
