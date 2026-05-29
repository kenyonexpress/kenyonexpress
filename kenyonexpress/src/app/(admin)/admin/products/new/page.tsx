import ProductForm from '@/components/admin/ProductForm'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'מוצר חדש' }

export default async function NewProductPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name_he')
    .eq('is_active', true)
    .order('name_he')

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">מוצר חדש</h1>
      <ProductForm categories={categories ?? []} />
    </div>
  )
}
