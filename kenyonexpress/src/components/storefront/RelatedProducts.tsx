import ProductCard, { type Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'

interface Props {
  categoryId: string
  excludeId: string
}

/**
 * Server component: fetches up to 4 active products from the same category
 * (excluding the current product) and renders them with the shared ProductCard.
 */
export default async function RelatedProducts({ categoryId, excludeId }: Props) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, images, stock_quantity')
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(4)

  const products = (data ?? []) as Product[]
  if (products.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-black text-brand-dark mb-4">מוצרים נוספים</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
