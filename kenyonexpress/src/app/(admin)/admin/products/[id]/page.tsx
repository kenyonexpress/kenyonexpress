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

  const [{ data: product }, { data: vendors }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase
      .from('vendors')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name'),
    supabase.from('categories').select('id, name_he').eq('is_active', true).order('name_he'),
  ])

  if (!product) notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת מוצר</h1>
      <ProductForm product={product} vendors={vendors ?? []} categories={categories ?? []} />
    </div>
  )
}
