import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'

/**
 * The merchant directory: `/merchants` (STEP 63).
 *
 * One card per ACTIVE supplier: logo, the categories it sells in, its city,
 * and how many coupons it has on the site right now. Each card links to the
 * supplier's own storefront, `/s/[id]`, which is where the products are.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY.
 *
 * - Ratings. Migration 232 ended the public display of ratings; the product
 *   page dropped its aggregate, and the catalogue's own rule (principle 0.5,
 *   ARCHITECTURE-CATALOG-SEARCH-SEO.md) is no `aggregateRating` anywhere a
 *   shopper or a crawler reads. A directory that ranked merchants by stars
 *   would be the one surface still publishing the number. `reviews` is not
 *   selected, not joined, not counted, and `merchant-directory.test.ts`
 *   refuses the column.
 * - Commission columns. `platform_percent` and every split column are an
 *   admin fact, same as on `/s/[id]`.
 * - Contact details. `contact_email`, `contact_phone`, `notes`,
 *   `business_id` are the supplier's relationship with the platform, not a
 *   listing. The storefront page prints the phone; this list does not.
 *
 * "COUPONS OFFERED" IS THE SUPPLIER'S ACTIVE PRODUCT COUNT. Measured against
 * production on 2026-10-08: 46 active products, 1 carries `type = 'coupon'`,
 * and that one sits in the test category. The business sells every listing
 * as a voucher the customer scans at the till, so the honest count is "what
 * `/s/[id]` would show", which is exactly the predicate used there:
 * `status = 'active' AND deleted_at IS NULL`.
 *
 * "CATEGORY" IS DERIVED. `suppliers` has no category column. A merchant's
 * categories are the ones its live products sit in, most frequent first, at
 * most `MAX_CATEGORIES_PER_MERCHANT`. A supplier with no live product has no
 * category and is listed last with "אין קופונים כרגע".
 *
 * "CITY" IS `suppliers.city`, the only location the anon role can read
 * (`supplier_branches` is not anon-readable). Measured 2026-10-08: none of
 * the seven active suppliers has it filled, so the card omits the line
 * rather than printing a placeholder.
 */

export const MAX_CATEGORIES_PER_MERCHANT = 3

/** The supplier columns the directory reads. No contact, no commission, no rating. */
export const MERCHANT_DIRECTORY_SUPPLIER_COLUMNS = 'id, name, city, logo_url, status, deleted_at'

/** The product columns the directory reads: enough to count and to group. */
export const MERCHANT_DIRECTORY_PRODUCT_COLUMNS =
  'supplier_id, categories!products_category_id_fkey(name_he, slug)'

export type MerchantCategory = { name_he: string; slug: string }

export type MerchantDirectoryEntry = {
  id: string
  name: string
  city: string | null
  logoUrl: string | null
  /** Most frequent first, at most `MAX_CATEGORIES_PER_MERCHANT`. */
  categories: MerchantCategory[]
  /** Active, non-deleted products listed under the supplier. */
  couponCount: number
}

export type DirectorySupplierRow = {
  id: string
  name: string
  city: string | null
  logo_url: string | null
  status: string
  deleted_at: string | null
}

export type DirectoryProductRow = {
  supplier_id: string | null
  /** PostgREST returns the embed as an object for a to-one FK, an array otherwise. */
  categories: MerchantCategory | MerchantCategory[] | null
}

function primaryCategory(row: DirectoryProductRow): MerchantCategory | null {
  const joined = row.categories
  const one = Array.isArray(joined) ? joined[0] : joined
  if (!one || typeof one.slug !== 'string' || typeof one.name_he !== 'string') return null
  return { name_he: one.name_he, slug: one.slug }
}

const collator = new Intl.Collator('he-IL')

/**
 * Pure: supplier rows plus product rows in, directory entries out.
 *
 * Only active, non-deleted suppliers are listed. Product rows are expected to
 * be pre-filtered to active and non-deleted (the query does it); a product
 * whose supplier is not in the list is ignored, which is what a product
 * pointing at a soft-deleted supplier should be.
 *
 * Order: merchants with coupons first, more coupons first, then Hebrew
 * alphabetical; merchants with none at the end, alphabetical.
 */
export function buildMerchantDirectory(
  suppliers: readonly DirectorySupplierRow[],
  products: readonly DirectoryProductRow[],
): MerchantDirectoryEntry[] {
  const counts = new Map<string, number>()
  const categoryTallies = new Map<string, Map<string, { category: MerchantCategory; n: number }>>()

  for (const product of products) {
    const supplierId = product.supplier_id
    if (!supplierId) continue
    counts.set(supplierId, (counts.get(supplierId) ?? 0) + 1)
    const category = primaryCategory(product)
    if (!category) continue
    let tally = categoryTallies.get(supplierId)
    if (!tally) {
      tally = new Map()
      categoryTallies.set(supplierId, tally)
    }
    const existing = tally.get(category.slug)
    if (existing) existing.n += 1
    else tally.set(category.slug, { category, n: 1 })
  }

  const entries: MerchantDirectoryEntry[] = []
  for (const supplier of suppliers) {
    if (supplier.status !== 'active' || supplier.deleted_at) continue
    const tally = categoryTallies.get(supplier.id)
    const categories = tally
      ? [...tally.values()]
          .sort((a, b) => b.n - a.n || collator.compare(a.category.name_he, b.category.name_he))
          .slice(0, MAX_CATEGORIES_PER_MERCHANT)
          .map((t) => t.category)
      : []
    entries.push({
      id: supplier.id,
      name: supplier.name,
      city: supplier.city?.trim() ? supplier.city.trim() : null,
      logoUrl: supplier.logo_url?.trim() ? supplier.logo_url.trim() : null,
      categories,
      couponCount: counts.get(supplier.id) ?? 0,
    })
  }

  return entries.sort(
    (a, b) =>
      Number(b.couponCount > 0) - Number(a.couponCount > 0) ||
      b.couponCount - a.couponCount ||
      collator.compare(a.name, b.name),
  )
}

/** Hebrew copy for the coupon count line on a card. */
export function couponCountLabel(count: number): string {
  if (count <= 0) return 'אין קופונים כרגע'
  if (count === 1) return 'קופון אחד'
  return `${count} קופונים`
}

export async function loadMerchantDirectory(): Promise<MerchantDirectoryEntry[]> {
  'use cache'
  cacheLife(CacheLife.list)
  // `productList` is staled by every product change that moves a list, which
  // is what changes a count or a category here. A supplier row edit (logo,
  // city) stales nothing in `cacheTagsForChange` today, exactly as on
  // `/s/[id]`, and rides the five-minute revalidate instead.
  cacheTag(CATALOGUE_TAG, CacheTags.productList)

  const supabase = createCatalogueReadClient()
  const [suppliersRead, productsRead] = await Promise.all([
    supabase
      .from('suppliers')
      .select(MERCHANT_DIRECTORY_SUPPLIER_COLUMNS)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(500),
    supabase
      .from('products')
      .select(MERCHANT_DIRECTORY_PRODUCT_COLUMNS)
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('supplier_id', 'is', null)
      .limit(5000),
  ])
  const suppliers = orFail(suppliersRead, 'catalogue.merchant_directory_suppliers_failed')
  const products = orFail(productsRead, 'catalogue.merchant_directory_products_failed')
  return buildMerchantDirectory(
    (suppliers ?? []) as DirectorySupplierRow[],
    (products ?? []) as DirectoryProductRow[],
  )
}

export const loadMerchantDirectoryCached = cache(loadMerchantDirectory)
