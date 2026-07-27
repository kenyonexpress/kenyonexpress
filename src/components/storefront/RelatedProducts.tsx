import ProductCard, { type Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'

interface Props {
  categoryId: string | null
  excludeId: string
}

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories!products_category_id_fkey(name_he, slug)'

type Row = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

function toProduct(r: Row): Product {
  const cat = Array.isArray(r.categories) ? (r.categories[0] ?? null) : r.categories
  return {
    id: r.id,
    slug: r.slug,
    name_he: r.name_he,
    kenyon_price: r.kenyon_price,
    full_price: r.full_price,
    images: r.images,
    stock_quantity: r.stock_quantity,
    category: cat,
  }
}

/**
 * Server component: shows up to 4 related products, preferring the same
 * category and filling with other recent products when the category is sparse.
 */
export default async function RelatedProducts({ categoryId, excludeId }: Props) {
  const supabase = await createClient()

  const byId = new Map<string, Product>()

  if (categoryId) {
    const { data } = await supabase
      .from('products')
      .select(SELECT)
      .eq('category_id', categoryId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .neq('id', excludeId)
      .order('created_at', { ascending: false })
      .limit(4)
    for (const r of (data ?? []) as Row[]) byId.set(r.id, toProduct(r))
  }

  if (byId.size < 4) {
    const { data } = await supabase
      .from('products')
      .select(SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .neq('id', excludeId)
      .order('created_at', { ascending: false })
      .limit(8)
    for (const r of (data ?? []) as Row[]) {
      if (byId.size >= 4) break
      if (!byId.has(r.id)) byId.set(r.id, toProduct(r))
    }
  }

  const products = [...byId.values()].slice(0, 4)
  if (products.length === 0) return null

  return (
    <section className="pdp-related">
      <h2 className="pdp-related__title">מומלצים</h2>
      <div className="pdp-related__grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
