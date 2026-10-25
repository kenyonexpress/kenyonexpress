import type { Product } from '@/components/ProductCard'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { parseIls } from '@/lib/money'
import { type RankableProduct, rankRelated } from '@/lib/related-ranking'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
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
 *
 * ORDER. The category read takes a pool of the newest `POOL_SIZE` products and
 * `rankRelated` picks from it: shared tags first, then closeness in price, then
 * newest (`related-ranking.ts`). The viewed product's own price and tags come
 * from one extra single-row read. It sits inside the same cache entry, so it is
 * paid once per product per cache life and not per visitor.
 */

/** Candidates fetched per category. The strip shows `STRIP_SIZE` of them. */
const POOL_SIZE = 24
const STRIP_SIZE = 5

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, city, tags, categories!products_category_id_fkey(name_he, slug)'

type Row = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  city?: string | null
  tags?: string[] | null
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
    city: r.city ?? null,
    category: cat,
  }
}

/** The catalogue's shekel column as integer agorot, or null when it has no usable price. */
function priceAgorot(value: number | string | null): number | null {
  if (value === null) return null
  try {
    const amount = parseIls(value)
    return amount > 0 ? amount : null
  } catch {
    return null
  }
}

function toRankable(r: Pick<Row, 'id' | 'kenyon_price' | 'tags'>): RankableProduct {
  return { id: r.id, priceAgorot: priceAgorot(r.kenyon_price), tags: r.tags ?? [] }
}

export async function loadRelatedProducts(
  categoryId: string | null,
  excludeId: string,
): Promise<Product[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createCatalogueReadClient()
  const byId = new Map<string, Product>()

  if (categoryId) {
    const anchorRows = orFail(
      await supabase.from('products').select('id, kenyon_price, tags').eq('id', excludeId).limit(1),
      'related_products.anchor_failed',
      { exclude_id: excludeId },
    )
    const anchorRow = ((anchorRows ?? []) as Pick<Row, 'id' | 'kenyon_price' | 'tags'>[])[0]

    const data = orFail(
      await supabase
        .from('products')
        .select(SELECT)
        .eq('category_id', categoryId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(POOL_SIZE),
      'related_products.by_category_failed',
      { category_id: categoryId, exclude_id: excludeId },
    )
    const rows = (data ?? []) as Row[]
    const ranked = rankRelated(
      anchorRow ? toRankable(anchorRow) : null,
      rows.map((row) => ({ ...toRankable(row), row })),
      STRIP_SIZE,
    )
    for (const { row } of ranked) byId.set(row.id, toProduct(row))
  }

  // Second round trip only when the category could not fill the strip. It stays
  // sequential on purpose: firing it alongside the first would pay for it on
  // every well-stocked category, which is most of them.
  if (byId.size < 4) {
    const data = orFail(
      await supabase
        .from('products')
        .select(SELECT)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(8),
      'related_products.fallback_failed',
      { exclude_id: excludeId },
    )
    for (const r of (data ?? []) as Row[]) {
      if (byId.size >= 4) break
      if (!byId.has(r.id)) byId.set(r.id, toProduct(r))
    }
  }

  return [...byId.values()].slice(0, STRIP_SIZE)
}
