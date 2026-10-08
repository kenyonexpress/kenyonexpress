import ProductCard, { type Product } from '@/components/ProductCard'
import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'

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

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories!products_category_id_fkey(name_he, slug)'

/**
 * The products a landing block names, or the newest active ones when it
 * names none. Same columns and the same card as the home page's featured
 * strip, through the anon catalogue client (public columns only) and under
 * the catalogue tag, so an admin price edit refreshes a campaign page the
 * same way it refreshes the home page.
 *
 * Named slugs keep the editor's order; a slug that is not an active product
 * is simply not rendered, so a campaign cannot show a withdrawn deal.
 */
export async function loadLandingProducts(
  slugs: readonly string[],
  limit: number,
): Promise<Product[]> {
  'use cache'
  cacheLife(CacheLife.list)
  cacheTag(CATALOGUE_TAG, CacheTags.productList)

  const supabase = createCatalogueReadClient()
  const base = supabase
    .from('products')
    .select(SELECT)
    .eq('status', 'active')
    .is('deleted_at', null)
  const { data } = slugs.length
    ? await base.in('slug', [...slugs]).limit(Math.min(limit, slugs.length))
    : await base.order('created_at', { ascending: false }).limit(limit)

  const rows = (data ?? []) as Row[]
  const products: Product[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price,
    images: row.images,
    stock_quantity: row.stock_quantity,
    category: Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories,
  }))

  if (slugs.length === 0) return products
  const order = new Map(slugs.map((slug, index) => [slug, index]))
  return products.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
}

export default async function LandingProducts({
  title,
  slugs,
  limit = 8,
}: {
  title?: string
  slugs: readonly string[]
  limit?: number
}) {
  const products = await loadLandingProducts(slugs, limit)
  if (products.length === 0) return null

  return (
    <section aria-label={title ?? 'מוצרים'} className="py-2">
      {title && <h2 className="mb-4 text-xl font-semibold text-heading">{title}</h2>}
      <div className="jet-listing-grid-deals bg-white">
        {products.map((product) => (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductCard product={product} variant="deals" />
          </div>
        ))}
      </div>
    </section>
  )
}
