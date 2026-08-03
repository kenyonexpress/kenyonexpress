import type { Product } from '@/components/ProductCard'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The "מומלצים" strip at the foot of a product page, cached.
 *
 * WHY THIS EXISTS. [42] moved the product's own four tables behind `use cache`
 * and left this component reading through `createClient()`, the request-scoped
 * client that reads cookies. That one survivor was the whole of the product
 * page's per-request cost, and it was never PPR overhead the way STATE.md
 * assumed: measured on a clean build, TTFB on `/product/[slug]` is 4ms and the
 * FULL response is 268-289ms, while one warm keep-alive round trip to this
 * Supabase project is 266-313ms. The floor was one query, not a framework.
 *
 * Nothing here is per-shopper. It is "other active products in this category",
 * identical for everyone who asks for the same slug, so it belongs behind
 * `use cache` on a client with no cookies to read -- the same treatment, and
 * the same `cacheTag(CATALOGUE_TAG)` contract, as `product-detail.ts`: an admin
 * write path calls `updateTag(CATALOGUE_TAG)` and this strip refills with it.
 *
 * Keyed by `(categoryId, excludeId)`, which is one entry per product rather
 * than one per visitor.
 */

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

export async function loadRelatedProducts(
  categoryId: string | null,
  excludeId: string,
): Promise<Product[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
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
      .limit(5)
    for (const r of (data ?? []) as Row[]) byId.set(r.id, toProduct(r))
  }

  // Second round trip only when the category could not fill the strip. It stays
  // sequential on purpose: firing it alongside the first would pay for it on
  // every well-stocked category, which is most of them.
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

  return [...byId.values()].slice(0, 5)
}
