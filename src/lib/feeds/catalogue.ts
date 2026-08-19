import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { type CouponOffer, buildCouponOffer } from '@/lib/commerce/coupon-offer'
import { isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The one catalogue read both feeds are built from.
 *
 * Same client, same cache profile and same tag as `sitemap.ts`: `createPublicClient`
 * (anon, because the service-role key fails silently on this machine and once
 * collapsed the sitemap to three URLs), `use cache` + `cacheLife('hours')`, and
 * `CATALOGUE_TAG` so an admin save refreshes the feeds along with everything
 * else.
 *
 * WHY THE PRICE COMES THROUGH `buildCouponOffer` AND NOT OFF THE ROW
 *
 * A coupon product's sticker price (`price_ils`) is NOT what the customer pays
 * here; `coupon_price_ils` is the absolute amount charged online and the rest is
 * settled at the business. Publishing the sticker price in a Merchant feed
 * would advertise a number no checkout will ever charge, and a landing-page
 * price that disagrees with the feed is how a Merchant account gets suspended -
 * not a warning, a suspension. `buildCouponOffer` is the same function the
 * product page and the JSON-LD already read, which is what makes the three
 * unable to disagree.
 */

export interface FeedProduct {
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  brand: string | null
  gtin: string | null
  sku: string | null
  condition: string | null
  type: string | null
  publishedAt: Date | null
  updatedAt: Date | null
  /** Sticker price, for the strike-through / `g:price` on a discounted item. */
  fullPriceIls: number | null
  /** What checkout will actually charge. Null when the product cannot be sold. */
  payableIls: number | null
  inStock: boolean
  offer: CouponOffer | null
}

type Row = {
  slug: string | null
  name_he: string | null
  short_description_he: string | null
  description_he: string | null
  seo_description: string | null
  images: unknown
  brand: string | null
  barcode: string | null
  sku: string | null
  condition: string | null
  type: string | null
  stock_quantity: number | null
  published_at: string | null
  updated_at: string | null
  price_ils: number | null
  coupon_price_ils: number | null
  offer_valid_until: string | null
  coupon_expiry_days: number | null
}

const SELECT = `slug, name_he, short_description_he, description_he, seo_description,
  images, brand, barcode, sku, condition, type, stock_quantity,
  published_at, updated_at, price_ils, coupon_price_ils,
  offer_valid_until, coupon_expiry_days`

/**
 * `products.images` is jsonb and has been an array of strings, an array of
 * objects with a `url`, and null. Everything that is not a usable https URL on
 * an allowlisted host is dropped rather than guessed at: a feed item whose
 * image 404s is rejected by Google with the item named, and one pointing at a
 * host the CSP refuses renders broken on our own pages ([18]).
 */
function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  for (const entry of images) {
    const candidate =
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry !== null && 'url' in entry
          ? String((entry as { url: unknown }).url)
          : null
    if (candidate && isAllowedImageUrl(candidate)) return candidate
  }
  return null
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toNumber(value: number | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toFeedProduct(row: Row, now: Date): FeedProduct | null {
  if (!row.slug || !row.name_he) return null

  const isCoupon = row.type === 'coupon'
  const offer = isCoupon
    ? buildCouponOffer({
        fullPriceIls: row.price_ils,
        couponPriceIls: row.coupon_price_ils,
        validUntil: row.offer_valid_until,
        expiryDays: row.coupon_expiry_days,
        now,
      })
    : null

  const fullPriceIls = toNumber(row.price_ils)
  const payableIls = offer ? (offer.sellable ? offer.paidOnlineIls : null) : fullPriceIls

  return {
    slug: row.slug,
    name: row.name_he,
    // Shortest honest description first. Google truncates anyway, and the SEO
    // description is written to be read out of context, which is what a feed is.
    description: row.seo_description ?? row.short_description_he ?? row.description_he,
    imageUrl: firstImage(row.images),
    brand: row.brand,
    gtin: row.barcode,
    sku: row.sku,
    condition: row.condition,
    type: row.type,
    publishedAt: parseDate(row.published_at),
    updatedAt: parseDate(row.updated_at),
    fullPriceIls,
    payableIls,
    // A coupon is not stock: it is minted on payment. Only a physical line has
    // a count worth believing, and `null` there means "not tracked", not "zero".
    inStock: offer ? offer.sellable : row.stock_quantity === null || (row.stock_quantity ?? 0) > 0,
    offer,
  }
}

/**
 * Active, undeleted products, newest first.
 *
 * Ordered by `published_at` because that is what "new deals" means to a reader;
 * `created_at` counts the moment a draft row appeared, which can be months
 * before a shop went live.
 */
export async function getFeedProducts(limit = 200): Promise<FeedProduct[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('products')
      .select(SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit),
    'feed_catalogue.read_failed',
    { limit },
  )

  const now = new Date()
  return ((data ?? []) as unknown as Row[])
    .map((row) => toFeedProduct(row, now))
    .filter((product): product is FeedProduct => product !== null)
}
