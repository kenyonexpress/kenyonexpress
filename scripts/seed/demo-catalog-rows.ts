/**
 * Pure row builders for the demo catalogue: the dataset in agorot in, the
 * database's shekel columns out, through the same money module the admin form,
 * the server action and checkout use. No I/O, so the test can prove every row
 * before any script may write one.
 *
 * THE COUPON COLUMN CONVENTION, MEASURED RATHER THAN ASSUMED. The storefront
 * card (`src/lib/homepage/deals.ts`, `rails.ts`, `category-page.ts`) paints
 * `kenyon_price` as the price and `full_price` struck through; the cart bills
 * `coupon_price_ils` for a coupon (`src/lib/cart/pricing.ts`); the product page
 * builds the offer from `price_ils` as the face value and `coupon_price_ils` as
 * the online charge (`src/lib/product-detail.ts`). The E2E fixture
 * (`scripts/seed-test-data.mjs`) that the suite passes with writes exactly:
 *
 *     kenyon_price = coupon_price_ils = paid online
 *     price_ils    = full_price       = face value
 *
 * and that is what this does, so a coupon card, its cart line and its product
 * page all quote the same number.
 */

import { type Agorot, agorot, agorotToIls } from '@/lib/commerce/money'
import { assertPublishable, buildProductMoneyWrite } from '@/lib/commerce/product-money'
import type { Database } from '@/types/database'
import { type DemoProduct, type DemoSupplier, supplierOf } from './demo-catalog-data'

export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
export type MediaAssetInsert = Database['public']['Tables']['media_assets']['Insert']

/** Agorot to a shekel numeric for the live columns. The only conversion. */
export function toIls(value: number): number {
  return agorotToIls(agorot(value))
}

/** Whole-percent saving off the reference price, for `discount_percent`. */
export function discountPercentOf(priceAgorot: Agorot, originalAgorot: Agorot): number {
  return Math.round(((originalAgorot - priceAgorot) / originalAgorot) * 100)
}

export function toSupplierRow(supplier: DemoSupplier, logoUrl: string): SupplierInsert {
  return {
    id: supplier.id,
    name: supplier.name,
    contact_name: supplier.contactName,
    contact_email: supplier.contactEmail,
    contact_phone: supplier.contactPhone,
    whatsapp: supplier.whatsapp,
    address: supplier.address,
    city: supplier.city,
    website: supplier.website,
    business_id: supplier.businessId,
    logo_url: logoUrl,
    status: 'active',
  }
}

export type ProductRowContext = {
  categoryId: string
  /** The largest webp rendition's public URL; what `products.images[0]` holds. */
  imageUrl: string
  /** Supplier logo URL, for the publish gate. */
  supplierLogoUrl: string
  now: Date
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/**
 * One product row, or a thrown error naming the product and the gate reason.
 *
 * Runs the publish gate with the supplier identity, so a row this function
 * returns is one the admin form would have been allowed to publish.
 */
export function toProductRow(product: DemoProduct, ctx: ProductRowContext): ProductInsert {
  const supplier = supplierOf(product)
  const paidIls = toIls(product.priceAgorot)
  const faceIls = toIls(product.originalPriceAgorot)
  const isCoupon = product.type === 'coupon'
  const discountPercent = discountPercentOf(
    agorot(product.priceAgorot),
    agorot(product.originalPriceAgorot),
  )

  // For a coupon the sticker is the face value and the online charge is
  // `couponPriceIls`; the module derives the badge from the two. For a physical
  // product the sticker is what is paid and the badge is the saving off the
  // reference price.
  const money = buildProductMoneyWrite({
    type: product.type,
    kenyonPrice: isCoupon ? faceIls : paidIls,
    platformPercent: product.platformPercent,
    supplierSplitPercent: null,
    discountPercent: isCoupon ? null : discountPercent,
    couponPriceIls: isCoupon ? paidIls : null,
    couponExpiryDays: product.couponExpiryDays,
  })
  if (!money.ok) throw new Error(`${product.slug}: ${money.message}`)

  const gate = assertPublishable({
    type: product.type,
    priceIls: money.fields.price_ils,
    platformPercent: money.fields.platform_percent,
    supplierSplitPercent: money.fields.supplier_split_percent,
    discountPercent: money.fields.discount_percent,
    couponPriceIls: money.fields.coupon_price_ils,
    couponExpiryDays: money.fields.coupon_expiry_days,
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.contactPhone,
      address: supplier.address,
      logoUrl: ctx.supplierLogoUrl,
      status: 'active',
    },
  })
  if (!gate.ok) {
    throw new Error(`${product.slug}: ${gate.blockers.map((b) => b.message).join(' · ')}`)
  }

  const nowIso = ctx.now.toISOString()

  return {
    id: product.id,
    slug: product.slug,
    name_he: product.nameHe,
    short_description_he: product.shortDescriptionHe,
    description_he: product.descriptionHe,
    seo_description: product.shortDescriptionHe,
    type: product.type,
    status: 'active',
    // The approval trigger returns early for a service-role write (no
    // auth.uid()), so the column has to be set here or the row stays pending.
    approval_status: 'approved',
    approved_at: nowIso,
    published_at: nowIso,
    category_id: ctx.categoryId,
    supplier_id: product.supplierId,
    city: supplier.city,
    images: [ctx.imageUrl],
    tags: ['demo'],
    is_featured: product.featured,
    // Money. Every shekel number below came out of `toIls` once.
    kenyon_price: paidIls,
    full_price: faceIls,
    ...money.fields,
    is_coupon_enabled: isCoupon,
    requires_shipping: !isCoupon,
    stock_quantity: product.stockQuantity,
    offer_valid_until:
      product.offerValidDays == null
        ? null
        : addDays(ctx.now, product.offerValidDays).toISOString(),
    redemption_instructions_he: isCoupon
      ? `יש להציג את קוד השובר בבית העסק ${supplier.name}, ${supplier.address}, ${supplier.city}, בתיאום מראש.`
      : null,
    coupon_terms_he: isCoupon ? 'השובר אישי, ניתן למימוש פעם אחת, ואינו ניתן להמרה למזומן.' : null,
  }
}

/** The media_assets row for a product or supplier image set. */
export function toMediaAssetRow(input: {
  id: string
  altHe: string
  basePath: string
  provider: 'r2' | 'supabase'
  bucket: string | null
  mainUrl: string
  blurDataURL: string
  width: number
  height: number
  webp: { w: number; url: string }[]
  avif: { w: number; url: string }[]
}): MediaAssetInsert {
  return {
    id: input.id,
    url: input.mainUrl,
    alt_he: input.altHe,
    blur_data_url: input.blurDataURL,
    width: input.width,
    height: input.height,
    renditions: { webp: input.webp, avif: input.avif },
    provider: input.provider,
    bucket: input.bucket,
    base_path: input.basePath,
    created_by: null,
  }
}

/**
 * The products a removal may touch: ONLY `demo-` slugs, and none that an order
 * references. Pure, so the refusal is testable without a database.
 */
export function selectRemovable<T extends { id: string; slug: string }>(
  products: readonly T[],
  orderedProductIds: ReadonlySet<string>,
): { remove: T[]; keptForOrders: T[]; refusedNotDemo: T[] } {
  const remove: T[] = []
  const keptForOrders: T[] = []
  const refusedNotDemo: T[] = []
  for (const p of products) {
    if (!p.slug.startsWith('demo-')) refusedNotDemo.push(p)
    else if (orderedProductIds.has(p.id)) keptForOrders.push(p)
    else remove.push(p)
  }
  return { remove, keptForOrders, refusedNotDemo }
}
