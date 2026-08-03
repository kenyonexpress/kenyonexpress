import ViewTracker from '@/components/analytics/ViewTracker'
import { CouponTerms } from '@/components/storefront/CouponPricing'
import ProductGallery from '@/components/storefront/ProductGallery'
import ProductInfo from '@/components/storefront/ProductInfo'
import RelatedProducts from '@/components/storefront/RelatedProducts'
import ShippingInfo from '@/components/storefront/ShippingInfo'
import SupplierInfo from '@/components/storefront/SupplierInfo'
import { type CouponOffer, buildCouponOffer } from '@/lib/commerce/coupon-offer'
import { getProductSeoBySlug } from '@/lib/product-seo'
import { buildBreadcrumbJsonLd, buildProductJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readOptionalColumns,
  readStickerPriceIls,
} from '@/lib/supabase/optional-columns'
import { createClient } from '@/lib/supabase/server'
import '@/styles/product-page.css'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const data = await getProductSeoBySlug(slug)

  // Missing / inactive / soft-deleted: the body calls notFound(), which already
  // emits noindex via app/not-found.tsx. State it here too so a crawler that
  // only reads metadata never treats an empty shell as indexable ([26]).
  if (!data || data.status !== 'active' || data.deleted_at) {
    return {
      title: 'מוצר לא נמצא',
      robots: { index: false, follow: true },
      description: 'המוצר לא נמצא או שאינו זמין בקניון אקספרס.',
    }
  }

  const title = data.seo_title?.trim() || data.name_he || 'מוצר'
  // Most catalogue rows ship with null seo/short/body copy. Lighthouse SEO
  // fails the whole page when <meta name="description"> is absent ([26] scored
  // 58 on those). Fall back to a short Hebrew line from the product name so
  // every active PDP has a description without inventing marketing copy.
  const description =
    data.seo_description?.trim() ||
    data.short_description_he?.trim() ||
    data.description_he?.trim() ||
    `${title} בקניון אקספרס. קופונים, מבצעים ומשלוחים.`

  // A canonical, because the same product is reachable through more than one
  // path (category trails, search, share links with tracking parameters) and
  // without one those all compete as separate pages.
  const path = `/product/${encodeURIComponent(slug)}`
  const images = Array.isArray(data.images) ? (data.images as string[]).filter(Boolean) : []

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      locale: 'he_IL',
      ...(images.length > 0 ? { images: [images[0] as string] } : {}),
    },
  }
}

/**
 * The static shell of a product page.
 *
 * Every visible thing here is the product, and the product is `params.slug`, so
 * there is nothing to prerender but the frame. That frame is worth more than it
 * looks: `.pdp__inner` already carries `min-height: var(--pdp-content-h)`, the
 * measured height of live's content column, so the footer lands on its final
 * line before the product has been read and does not move when it arrives.
 *
 * Making the product itself static is `generateStaticParams` plus `use cache`
 * on a catalogue client that does not read cookies. That is the next step, and
 * deliberately not this one.
 */
function ProductPageFallback() {
  return (
    <div data-pdp="container" className="pdp">
      <div className="pdp__inner">
        <nav className="pdp-breadcrumb" aria-label="נתיב ניווט">
          <Link href="/">בית</Link>
        </nav>
      </div>
    </div>
  )
}

export default function ProductPage(props: Props) {
  return (
    <Suspense fallback={<ProductPageFallback />}>
      <ProductPageBody {...props} />
    </Suspense>
  )
}

async function ProductPageBody({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

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
    .single()

  if (!product) notFound()

  // Supplier is resolved separately so the SupplierInfo block renders on every
  // product (coupon and physical). suppliers RLS is admin-only, so the
  // public-safe name is read server-side via the service client (name only,
  // no contact details are exposed to the page).
  let supplier: { id: string; name: string } | null = null
  if (product.supplier_id) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('suppliers')
      .select('id, name')
      .eq('id', product.supplier_id)
      .maybeSingle()
    supplier = data
  }

  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, name_he, price, price_modifier, stock_quantity, sku')
    .eq('product_id', product.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name_he')

  const images = Array.isArray(product.images)
    ? (product.images as unknown[]).filter((u): u is string => typeof u === 'string')
    : []

  // Pipeline metadata (blur placeholder + mandatory Hebrew alt) for images
  // uploaded through the media pipeline; legacy URLs simply get no entry.
  let galleryAssets: Record<string, { alt: string | null; blurDataURL: string | null }> = {}
  if (images.length > 0) {
    const { data: assetRows } = await supabase
      .from('media_assets')
      .select('url, alt_he, blur_data_url')
      .in('url', images)
    galleryAssets = Object.fromEntries(
      (assetRows ?? []).map((a) => [a.url, { alt: a.alt_he, blurDataURL: a.blur_data_url }]),
    )
  }

  const category = Array.isArray(product.categories)
    ? null
    : (product.categories as { id: string; name_he: string; slug: string } | null)

  const basePrice = Number(product.kenyon_price ?? 0)
  const oldPrice =
    product.full_price != null && Number(product.full_price) > basePrice
      ? Number(product.full_price)
      : null

  // A coupon is priced by its own absolute model. Building the offer here, on
  // the server, from the same column the commission engine bills from is what
  // keeps the quoted price and the charged price identical; the page used to
  // render price * 0.1 and disagree with the cart.
  const isCoupon = product.type === 'coupon' || product.is_coupon_enabled

  // coupon_price_ils and offer_valid_until come from migration 054, which is
  // not applied to every deployment. Naming them in the select above would
  // fail the WHOLE product query with 42703 and blank the page; read
  // separately, a database without them simply yields an unpriced coupon.
  const coupon054 = isCoupon
    ? (
        await readOptionalColumns<Coupon054Row>(
          (select, ids) => supabase.from('products').select(select).in('id', ids) as never,
          COUPON_054_COLUMNS,
          [product.id],
          'product page',
        )
      ).get(product.id)
    : undefined

  // The sticker price the business would charge. Which column holds it depends
  // on whether migration 059 has been applied to this database, so it is probed
  // rather than named in the select above: a select naming a column this
  // database lacks fails the WHOLE query with 42703 and the page 404s. Both
  // spellings have shipped that outage, one week apart, each as the other's fix.
  const stickerPriceIls = isCoupon
    ? await readStickerPriceIls(
        (select, ids) => supabase.from('products').select(select).in('id', ids) as never,
        product.id,
        'product page',
      )
    : null

  const couponOffer: CouponOffer | null = isCoupon
    ? buildCouponOffer({
        fullPriceIls: stickerPriceIls ?? product.full_price ?? basePrice,
        couponPriceIls: coupon054?.coupon_price_ils,
        validUntil: coupon054?.offer_valid_until,
        expiryDays: product.coupon_expiry_days,
      })
    : null

  const attributes: { label: string; value: string }[] = []
  if (category) attributes.push({ label: 'קטגוריה', value: category.name_he })
  attributes.push({
    label: 'סוג מוצר',
    value: product.type === 'coupon' ? 'קופון' : 'מוצר פיזי',
  })

  // Structured data, built from the values this page already resolved and never
  // from a second calculation: a JSON-LD price is a public claim about what
  // something costs, and this page has previously rendered a price the cart
  // disagreed with. `couponOffer` is the object the commission engine bills
  // from, so the advertised price and the charged price cannot diverge.
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const productLd = buildProductJsonLd({
    name: product.name_he,
    description: product.description_he ?? null,
    slug: product.slug,
    sku: product.sku ?? null,
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
    siteUrl,
    supplierName: supplier?.name ?? null,
    categoryName: category?.name_he ?? null,
    priceIls: isCoupon ? null : basePrice,
    fullPriceIls: isCoupon ? null : oldPrice,
    couponOffer,
    stockQuantity: product.stock_quantity ?? null,
  })
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      ...(category ? [{ name: category.name_he, path: `/category/${category.slug}` }] : []),
      { name: product.name_he, path: `/product/${product.slug}` },
    ],
    siteUrl,
  )

  return (
    <div data-pdp="container" className="pdp">
      <div className="pdp__inner">
        {/* Both nodes, one script each, mirroring the visible breadcrumb below. */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no
          // other insertion point, and jsonLdScript escapes every angle bracket
          // so catalogue text cannot close the tag.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(productLd) }}
        />
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: same as above.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
        />
        <ViewTracker
          event="view_product"
          props={{
            product_id: product.id,
            category_id: product.category_id,
            price_ils: product.kenyon_price,
            product_type: product.type,
          }}
        />

        {/* Breadcrumb. The row is 84px on live, and that height is what puts
            the columns block below it on y250. */}
        <nav className="pdp-breadcrumb" aria-label="נתיב ניווט">
          <Link href="/">בית</Link>
          {category && (
            <>
              <span className="pdp-breadcrumb__sep">/</span>
              <Link href={`/category/${category.slug}`}>{category.name_he}</Link>
            </>
          )}
          <span className="pdp-breadcrumb__sep">/</span>
          <span>{product.name_he}</span>
        </nav>

        {/* Two columns: gallery (right in RTL, 470px) + summary (left, 670px).
            No card wrapper: live puts both straight on the page, and the
            border plus 32px of padding we used to draw round them offset every
            row inside by the width of the chrome. */}
        <div data-pdp="columns" className="pdp__columns">
          <ProductGallery images={images} name={product.name_he} assets={galleryAssets} />
          <ProductInfo
            productId={product.id}
            name={product.name_he}
            nameEn={product.name_en}
            basePrice={basePrice}
            oldPrice={oldPrice}
            baseStock={product.stock_quantity}
            sku={product.sku}
            categoryName={category?.name_he ?? null}
            attributes={attributes}
            variants={variants ?? []}
            isCoupon={isCoupon}
            couponOffer={couponOffer}
          />
        </div>

        {/* Coupon-only: how and by when the voucher may be redeemed. */}
        {couponOffer && (
          <div className="pdp-coupon">
            <CouponTerms
              offer={couponOffer}
              terms={product.coupon_terms_he}
              instructions={product.redemption_instructions_he}
            />
          </div>
        )}

        {/* One flat band for description, shipping and supplier. Live leaves
            160px here before the recommendations; the same three blocks as
            stacked bordered cards took 423px and carried the footer 230px down
            the page, which is what every band below y1400 was really measuring.

            Physical-only for shipping. The platform/supplier split stays off
            the page either way — it is an internal settlement detail and the
            customer pays the full price however it divides. */}
        <div className="pdp-details">
          {product.description_he && (
            <section aria-label="תיאור המוצר">
              <h2 className="pdp-details__title">תיאור המוצר</h2>
              <p className="pdp-details__text">{product.description_he}</p>
            </section>
          )}

          {!isCoupon && (
            <ShippingInfo
              requiresShipping={product.requires_shipping}
              weightGrams={product.weight_grams}
              warrantyMonths={product.warranty_months}
            />
          )}

          {/* Supplier details: rendered for every product (coupon and physical) */}
          <SupplierInfo supplier={supplier} productType={product.type} />
        </div>

        {/* Related products */}
        <RelatedProducts categoryId={product.category_id} excludeId={product.id} />
      </div>
    </div>
  )
}
