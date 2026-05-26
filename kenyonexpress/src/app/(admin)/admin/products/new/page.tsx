import ProductForm from '@/components/admin/ProductForm'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'מוצר חדש' }

export default async function NewProductPage() {
  const supabase = await createClient()
  const [{ data: vendors }, { data: categories }] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name'),
    supabase.from('categories').select('id, name_he').eq('is_active', true).order('name_he'),
  ])

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">מוצר חדש</h1>
      <ProductForm vendors={vendors ?? []} categories={categories ?? []} />
    </div>
  )
}
