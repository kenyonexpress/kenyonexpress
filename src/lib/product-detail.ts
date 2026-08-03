import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { type CouponOffer, buildCouponOffer } from '@/lib/commerce/coupon-offer'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/anon'
import {
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readOptionalColumns,
  readStickerPriceIls,
} from '@/lib/supabase/optional-columns'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The catalogue half of a product page, cached.
 *
 * WHY THIS EXISTS. `ProductPageBody` read all four of these tables through
 * `createClient()`, the request-scoped client that reads cookies. A cookie read
 * makes the segment uncacheable, so every product view ran four round trips to
 * Postgres. Measured under load in [41]: `load/browse.js` (L1) failed on the
 * product page at **1.2-1.9s hot** while the home page answered in 6ms, and the
 * gap was neither a cold cache nor the machine -- it was these queries running
 * per request.
 *
 * None of this data is per-shopper. It is the catalogue, identical for everyone
 * who asks for the same slug, so it belongs behind `use cache` on a client that
 * has no cookies to read. That is the note `product/[slug]/page.tsx:83` left as
 * "the next step"; this is that step.
 *
 * `cacheTag(CATALOGUE_TAG)` is not decoration. Read the contract in
 * `catalogue-cache.ts`: every admin write path already calls
 * `updateTag(CATALOGUE_TAG)`, so a product edited in the panel invalidates this
 * entry too. Without the tag an edit would take up to an hour to appear and
 * nothing would report it.
 *
 * THE ONE FIELD THAT IS DELIBERATELY STALE: `stock_quantity`. `finalize.ts`
 * decrements it on every sale and deliberately does not invalidate the
 * catalogue, because emptying the cache on every purchase is the opposite of
 * what a cache is for. The page can therefore show a stock figure up to an hour
 * old. It cannot oversell: `server/actions/cart.ts` re-reads stock live on add
 * and checkout reads it again. Same trade-off the archive cards already make.
 */

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof loadProductBySlug>>>

export async function loadProductBySlug(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()

  const { data: product } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, description_he,
       kenyon_price, full_price, is_coupon_enabled,
       coupon_expiry_days, coupon_terms_he, redemption_instructions_he,
       requires_shipping, weight_grams, warranty_months,
       type, sku, images, stock_quantity, category_id, supplier_id,
       categories!products_category_id_fkey(id, name_he, slug)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()

  if (!product) return null

  const images = Array.isArray(product.images)
    ? (product.images as unknown[]).filter((u): u is string => typeof u === 'string')
    : []

  // The coupon fields live behind migrations 054 and 059, which are not on
  // every deployment, so they are probed rather than named in the select
  // above -- naming a column this database lacks fails the WHOLE query with
  // 42703 and blanks the page. Both spellings have shipped that outage. They
  // are read HERE, inside the cache, because they are catalogue data like the
  // rest; left on the page they stayed two per-request round trips on exactly
  // the coupon products the shop exists to sell.
  const isCoupon = product.type === 'coupon' || product.is_coupon_enabled
  const probe = (select: string, ids: string[]) =>
    createPublicClient().from('products').select(select).in('id', ids) as never

  // Three independent reads, so they go together rather than in sequence. On
  // a cache miss this is the difference between one round trip and three.
  const [supplier, variants, galleryAssets, coupon054, stickerPriceIls] = await Promise.all([
    loadSupplierName(product.supplier_id),
    supabase
      .from('product_variants')
      .select('id, name_he, price, price_modifier, stock_quantity, sku')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name_he')
      .then(({ data }) => data),
    loadGalleryAssets(images),
    isCoupon
      ? readOptionalColumns<Coupon054Row>(
          probe,
          COUPON_054_COLUMNS,
          [product.id],
          'product page',
        ).then((rows) => rows.get(product.id))
      : Promise.resolve(undefined),
    isCoupon ? readStickerPriceIls(probe, product.id, 'product page') : Promise.resolve(null),
  ])

  const basePrice = Number(product.kenyon_price ?? 0)

  // Built HERE and not on the page, because `buildCouponOffer` reads the
  // current time to decide whether the offer has lapsed, and a Server
  // Component may not read the clock while prerendering -- that is what broke
  // the build the moment this page became static. Inside `use cache` the read
  // is legal and, better, honest: the answer is re-evaluated every time the
  // entry refills, so "expired" tracks the same hourly budget as every other
  // field on the page instead of being frozen at build time.
  const couponOffer: CouponOffer | null = isCoupon
    ? buildCouponOffer({
        fullPriceIls: stickerPriceIls ?? product.full_price ?? basePrice,
        couponPriceIls: coupon054?.coupon_price_ils,
        validUntil: coupon054?.offer_valid_until,
        expiryDays: product.coupon_expiry_days,
      })
    : null

  return {
    product,
    images,
    supplier,
    variants,
    galleryAssets,
    coupon054,
    stickerPriceIls,
    couponOffer,
  }
}

/**
 * `suppliers` RLS is admin-only, so the public-safe name comes through the
 * service client. Only id and name are selected: no contact details reach the
 * page, and nothing that is not already printed on it enters this cache.
 */
async function loadSupplierName(supplierId: string | null) {
  if (!supplierId) return null
  const { data } = await createAdminClient()
    .from('suppliers')
    .select('id, name')
    .eq('id', supplierId)
    .maybeSingle()
  return data
}

/** Blur placeholders and Hebrew alt text for pipeline-uploaded images. */
async function loadGalleryAssets(
  images: string[],
): Promise<Record<string, { alt: string | null; blurDataURL: string | null }>> {
  if (images.length === 0) return {}
  const { data } = await createPublicClient()
    .from('media_assets')
    .select('url, alt_he, blur_data_url')
    .in('url', images)
  return Object.fromEntries(
    (data ?? []).map((a) => [a.url, { alt: a.alt_he, blurDataURL: a.blur_data_url }]),
  )
}

/**
 * The slugs Next prerenders at build time.
 *
 * Capped, and the cap is the point: the catalogue is 61 products today but the
 * WP import will multiply that, and prerendering an unbounded catalogue turns
 * every deploy into a full crawl. Anything past the cap still works -- it is
 * rendered on first request and then cached by `loadProductBySlug` exactly like
 * a prerendered one, so the cap trades build time for one slow first view of a
 * long-tail product, not for a slow product page.
 */
export async function listProductSlugsForPrerender(limit = 200): Promise<string[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const { data } = await createPublicClient()
    .from('products')
    .select('slug')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => row.slug)
}
