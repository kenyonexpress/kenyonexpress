import ProductForm from '@/components/admin/ProductForm'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת מוצר' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: categories }, { data: variants }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('categories').select('id, name_he').eq('is_active', true).order('name_he'),
    supabase.from('product_variants').select('*').eq('product_id', id).is('deleted_at', null),
  ])

  if (!product) notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת מוצר</h1>
      <ProductForm product={product} variants={variants ?? []} categories={categories ?? []} />
    </div>
  )
}
