import type { Product } from '@/components/ProductCard'
import ProductCard from '@/components/ProductCard'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { createClient } from '@/lib/supabase/server'

/** refs/ke_live_singlefile.html — jet-listing-grid faf8583, 4 columns, no section title */
export default async function DealsOfTheDay() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(24)

  const staticSlugs = new Set(KE_LIVE_DEALS.map((p) => p.slug))
  const dbProducts: Product[] = (data ?? [])
    .filter((p) => !staticSlugs.has(p.slug))
    .map((p) => {
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

  const products = [...KE_LIVE_DEALS, ...dbProducts].slice(0, 24)

  return (
    <section aria-label="מוצרים מובילים" className="mx-auto max-w-page px-4 py-6">
      <div className="grid grid-cols-2 gap-0 bg-white lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
