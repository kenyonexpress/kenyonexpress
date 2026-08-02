import ProductForm, { type SupplierOption } from '@/components/admin/ProductForm'
import { requireSection } from '@/lib/admin/rbac'
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
  await requireSection('catalog', 'write')

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: product }, { data: categories }, { data: variants }, { data: suppliers }] =
    await Promise.all([
      supabase.from('products').select('*').eq('id', id).single(),
      supabase.from('categories').select('id, name_he').eq('is_active', true).order('name_he'),
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
      />
    </div>
  )
}
