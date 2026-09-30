import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import {
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readOptionalColumns,
} from '@/lib/supabase/optional-columns'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The "קופונים דומים" strip at the foot of a coupon page, cached.
 *
 * Same treatment as `related-products.ts` and for the same reason: nothing
 * here is per-shopper, so it lives behind `use cache` on the cookie-free
 * client under `CATALOGUE_TAG`. What differs is the FILTER. The product page's
 * strip fills from any recent product, and on a coupon page that puts a
 * barbecue grill under a restaurant voucher. A coupon is similar to a coupon:
 * the filter is the archive's own (`category-page.ts`, `productTypeFilter`),
 * `type = 'coupon' OR is_coupon_enabled`, so a product the archive lists as a
 * coupon is one here too, and the five live rows that are coupons by the flag
 * and physical by the enum are not dropped.
 *
 * The online price is probed through the 054 columns like the page's own
 * offer, and a coupon without one is still listed. Listing it without a price
 * is honest: the page it links to says the offer cannot be sold, and hiding
 * the coupon from the strip would not make it sellable.
 */

export interface SimilarCoupon {
  id: string
  slug: string
  name_he: string
  image: string | null
  /** Sticker price in shekels, `products.kenyon_price`. */
  fullPriceIls: number
  /** The admin-set online charge in shekels, or null when the column is unset. */
  paidOnlineIls: number | null
  category: { name_he: string; slug: string } | null
}

const SELECT =
  'id, slug, name_he, kenyon_price, images, category_id, categories!products_category_id_fkey(name_he, slug)'

const COUPON_FILTER = 'type.eq.coupon,is_coupon_enabled.is.true'

export interface SimilarCouponRow {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  category_id: string | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

export const SIMILAR_COUPONS_LIMIT = 4

/**
 * Same category first, newest first inside it, then the rest; the current
 * product never; no id twice. Pure so the ordering is tested without a client.
 */
export function orderSimilar(
  sameCategory: readonly SimilarCouponRow[],
  others: readonly SimilarCouponRow[],
  excludeId: string,
  limit = SIMILAR_COUPONS_LIMIT,
): SimilarCouponRow[] {
  const seen = new Set<string>([excludeId])
  const out: SimilarCouponRow[] = []
  for (const row of [...sameCategory, ...others]) {
    if (out.length >= limit) break
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((u): u is string => typeof u === 'string' && u.trim() !== '')
  return first ?? null
}

export function toSimilarCoupon(
  row: SimilarCouponRow,
  paidOnlineIls: number | null,
): SimilarCoupon {
  const cat = Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    image: firstImage(row.images),
    fullPriceIls: Number(row.kenyon_price ?? 0),
    paidOnlineIls,
    category: cat,
  }
}

export async function loadSimilarCoupons(
  categoryId: string | null,
  excludeId: string,
): Promise<SimilarCoupon[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createCatalogueReadClient()

  const sameCategory = categoryId
    ? ((orFail(
        await supabase
          .from('products')
          .select(SELECT)
          .eq('category_id', categoryId)
          .or(COUPON_FILTER)
          .eq('status', 'active')
          .is('deleted_at', null)
          .neq('id', excludeId)
          .order('created_at', { ascending: false })
          .limit(SIMILAR_COUPONS_LIMIT + 1),
        'similar_coupons.by_category_failed',
        { category_id: categoryId, exclude_id: excludeId },
      ) ?? []) as SimilarCouponRow[])
    : []

  // Second round trip only when the category could not fill the strip, as in
  // related-products.ts: paying for it on every well-stocked category is the
  // common case and the wrong one to spend on.
  const others =
    sameCategory.length < SIMILAR_COUPONS_LIMIT
      ? ((orFail(
          await supabase
            .from('products')
            .select(SELECT)
            .or(COUPON_FILTER)
            .eq('status', 'active')
            .is('deleted_at', null)
            .neq('id', excludeId)
            .order('created_at', { ascending: false })
            .limit(SIMILAR_COUPONS_LIMIT * 2),
          'similar_coupons.fallback_failed',
          { exclude_id: excludeId },
        ) ?? []) as SimilarCouponRow[])
      : []

  const rows = orderSimilar(sameCategory, others, excludeId)
  if (rows.length === 0) return []

  const probe = (select: string, ids: string[]) =>
    createCatalogueReadClient().from('products').select(select).in('id', ids) as never
  const priced = await readOptionalColumns<Coupon054Row>(
    probe,
    COUPON_054_COLUMNS,
    rows.map((r) => r.id),
    'similar coupons',
  )

  return rows.map((row) => {
    const raw = priced.get(row.id)?.coupon_price_ils
    const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw)
    return toSimilarCoupon(row, Number.isFinite(parsed) && parsed > 0 ? parsed : null)
  })
}
