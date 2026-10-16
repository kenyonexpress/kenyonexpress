import type { Product } from '@/components/ProductCard'

import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Load an expired product's basic info and similar active products.
 * Similar products are from the same category (preferring same supplier),
 * falling back to same city, then any active product.
 */
export interface ExpiredProductData {
  product: {
    id: string
    slug: string
    name_he: string
    kenyon_price: number | null
    full_price: number | null
    images: unknown
    category_id: string | null
    category: { name_he: string; slug: string } | null
    supplier_id: string | null
    city?: string | null
  }
  similarProducts: Product[]
}

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, category_id, supplier_id, categories!products_category_id_fkey(name_he, slug)'

type ProductRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  category_id: string | null
  supplier_id: string | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

function toProduct(r: ProductRow): Product {
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

export async function loadExpiredProduct(slug: string): Promise<ExpiredProductData | null> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG)

  const supabase = createCatalogueReadClient()

  // NOTE: This requires the 'expired' status to be added to the product_status enum.
  // Currently, the enum only includes: 'draft', 'active', 'paused', 'sold_out', 'archived'.
  // Until the migration is applied, this returns null.
  let expiredProduct: {
    id: string
    slug: string
    name_he: string
    kenyon_price: number | null
    full_price: number | null
    images: unknown
    category_id: string | null
    supplier_id: string | null
    categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
  } | null = null

  try {
    expiredProduct = orFail(
      await supabase
        .from('products')
        .select(
          `id, slug, name_he, kenyon_price, full_price, images, category_id, supplier_id,
         categories!products_category_id_fkey(id, name_he, slug)`,
        )
        .eq('slug', slug)
        .eq('status', 'expired')
        .is('deleted_at', null)
        .maybeSingle(),
      'expired_product.read_failed',
      { slug },
    )
  } catch (error) {
    // The 'expired' enum value doesn't exist yet. Gracefully return null.
    if (error instanceof Error && error.message.includes('invalid input value for enum')) {
      return null
    }
    throw error
  }

  if (!expiredProduct) return null

  cacheTag(CacheTags.product(expiredProduct.id))

  const categoryId = expiredProduct.category_id
  const supplierId = expiredProduct.supplier_id
  const excludeId = expiredProduct.id

  // Build similar products from same category, preferring same supplier
  const similarProducts: Product[] = []

  // First: same category + same supplier
  if (categoryId && supplierId) {
    const sameCategorySameSupplier = orFail(
      await supabase
        .from('products')
        .select(SELECT)
        .eq('category_id', categoryId)
        .eq('supplier_id', supplierId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(3),
      'expired_product.same_category_supplier_failed',
      { category_id: categoryId, supplier_id: supplierId },
    )

    for (const r of (sameCategorySameSupplier ?? []) as ProductRow[]) {
      similarProducts.push(toProduct(r))
      if (similarProducts.length >= 3) break
    }
  }

  // Second: same category (if we need more)
  if (similarProducts.length < 3 && categoryId) {
    const sameCategoryOtherSupplier = orFail(
      await supabase
        .from('products')
        .select(SELECT)
        .eq('category_id', categoryId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('id', excludeId)
        .neq('supplier_id', supplierId ?? '')
        .order('created_at', { ascending: false })
        .limit(3 - similarProducts.length),
      'expired_product.same_category_failed',
      { category_id: categoryId, exclude_id: excludeId },
    )

    const seen = new Set(similarProducts.map((p) => p.id))
    for (const r of (sameCategoryOtherSupplier ?? []) as ProductRow[]) {
      if (!seen.has(r.id)) {
        similarProducts.push(toProduct(r))
        if (similarProducts.length >= 3) break
      }
    }
  }

  // Third: any active product (if we still need more)
  if (similarProducts.length < 3) {
    const anyActive = orFail(
      await supabase
        .from('products')
        .select(SELECT)
        .eq('status', 'active')
        .is('deleted_at', null)
        .neq('id', excludeId)
        .order('created_at', { ascending: false })
        .limit(3 - similarProducts.length),
      'expired_product.fallback_failed',
      { exclude_id: excludeId },
    )

    const seen = new Set(similarProducts.map((p) => p.id))
    for (const r of (anyActive ?? []) as ProductRow[]) {
      if (!seen.has(r.id)) {
        similarProducts.push(toProduct(r))
        if (similarProducts.length >= 3) break
      }
    }
  }

  const category = Array.isArray(expiredProduct.categories)
    ? (expiredProduct.categories[0] ?? null)
    : expiredProduct.categories

  return {
    product: {
      id: expiredProduct.id,
      slug: expiredProduct.slug,
      name_he: expiredProduct.name_he,
      kenyon_price: expiredProduct.kenyon_price,
      full_price: expiredProduct.full_price,
      images: expiredProduct.images,
      category_id: expiredProduct.category_id,
      category,
      supplier_id: expiredProduct.supplier_id,
    },
    similarProducts,
  }
}
