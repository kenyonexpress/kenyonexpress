import type { Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'
import FeaturedProductsTabs from './FeaturedProductsTabs'

/** refs/electro.html .section-products-carousel — Featured Products tabbed section */
export default async function FeaturedProducts() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)',
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(16)

  const products: Product[] = (data ?? []).map((p) => {
    const cat = Array.isArray(p.categories) ? (p.categories[0] ?? null) : p.categories
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      kenyon_price: p.kenyon_price,
      full_price: p.full_price,
      images: p.images,
      stock_quantity: p.stock_quantity,
      category: cat,
    }
  })

  if (products.length === 0) return null

  return (
    <section
      dir="rtl"
      aria-label="מוצרים מומלצים"
      className="mx-auto max-w-page px-4 py-6 font-sans"
    >
      <FeaturedProductsTabs products={products} />
    </section>
  )
}
