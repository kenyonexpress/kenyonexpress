import ProductCard, { type Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'כל המוצרים',
  description: 'כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.',
}

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, images, stock_quantity')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(24)

  const products = (data ?? []) as Product[]

  return (
    <div className="max-w-[1320px] mx-auto px-4 py-6 space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-black text-gray-900">כל המוצרים</h1>
        <span className="text-sm text-gray-500">{products.length} מוצרים</span>
      </header>

      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-5xl mb-3">📦</p>
          <p className="font-semibold text-gray-600">אין מוצרים זמינים כרגע</p>
          <p className="text-sm mt-1">בקרוב יתווספו מוצרים חדשים</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
