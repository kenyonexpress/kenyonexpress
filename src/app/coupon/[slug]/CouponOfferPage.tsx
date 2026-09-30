import ViewTracker from '@/components/analytics/ViewTracker'
import CouponTermsAccordion from '@/components/coupon-offer/CouponTermsAccordion'
import CouponVoucherPreview from '@/components/coupon-offer/CouponVoucherPreview'
import MerchantMap from '@/components/coupon-offer/MerchantMap'
import SimilarCoupons from '@/components/coupon-offer/SimilarCoupons'
import StoreShell from '@/components/store/StoreShell'
import CouponQrExpiry from '@/components/storefront/CouponQrExpiry'
import ProductGallery from '@/components/storefront/ProductGallery'
import ProductInfo from '@/components/storefront/ProductInfo'
import StockScarcity from '@/components/storefront/StockScarcity'
import { productLocation } from '@/lib/geo/distance'
import type { ProductDetail } from '@/lib/product-detail'
import { buildBreadcrumbJsonLd, buildProductJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import { buildSupplierContact } from '@/lib/supplier-contact'
import { buildRedemptionInquiryText } from '@/lib/whatsapp'
import '@/styles/coupon-offer.css'
import '@/styles/product-page.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * The coupon variant of a product page: `/coupon/<slug>`.
 *
 * Same catalogue read as `/product/[slug]` (`loadProductBySlug`, cached under
 * the catalogue tag), same gallery and the same buy column, because the
 * coupon IS the product and the price the buy button charges must be the one
 * the page quotes. What is different is everything under the columns: a
 * preview of the voucher with its code masked, the terms as an accordion, the
 * business on a map, and other coupons instead of other products.
 *
 * A product that is not a coupon has no coupon variant and is sent to its
 * product page rather than shown a voucher preview for a grill. The type is
 * resolved the way the product page resolves it (`couponOffer` is non-null
 * exactly when `resolveStorefrontProductType` said coupon), so the two pages
 * cannot disagree about which products are coupons.
 *
 * CANONICAL IS THE PRODUCT PAGE, and the variant is noindex. Both pages
 * describe one product, and `robots.ts` refuses the whole `/coupon/` prefix
 * because the other half of it is a customer's voucher. Consolidating on the
 * product page is what a crawler would have done anyway; saying so keeps the
 * two from competing.
 */

type SeoRow = {
  status: string | null
  deleted_at: string | null
  seo_title: string | null
  seo_description: string | null
  name_he: string | null
  short_description_he: string | null
  description_he: string | null
} | null

export function couponOfferMetadata(slug: string, data: SeoRow): Metadata {
  if (!data || data.status !== 'active' || data.deleted_at) {
    return {
      title: 'קופון לא נמצא',
      robots: { index: false, follow: true },
      description: 'הקופון לא נמצא או שאינו זמין בקניון אקספרס.',
    }
  }
  const name = data.seo_title?.trim() || data.name_he || 'קופון'
  const title = `קופון: ${name}`
  const description =
    data.seo_description?.trim() ||
    data.short_description_he?.trim() ||
    data.description_he?.trim() ||
    `${name} בקניון אקספרס. משלמים חלק באתר, מציגים שובר בבית העסק ומשלמים שם את היתרה.`
  const productPath = `/product/${encodeURIComponent(slug)}`
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: productPath },
    openGraph: {
      title,
      description,
      url: `/coupon/${encodeURIComponent(slug)}`,
      type: 'website',
      locale: 'he_IL',
    },
  }
}

export default function CouponOfferPage({
  slug,
  detail,
}: {
  slug: string
  detail: ProductDetail | null
}) {
  if (!detail) notFound()

  const {
    product,
    images,
    supplier,
    variants,
    galleryAssets,
    couponOffer,
    rating,
    cashbackPercent,
  } = detail

  if (!couponOffer) redirect(`/product/${encodeURIComponent(slug)}`)

  const category = Array.isArray(product.categories)
    ? null
    : (product.categories as { id: string; name_he: string; slug: string } | null)

  const basePrice = Number(product.kenyon_price ?? 0)
  const oldPrice =
    product.full_price != null && Number(product.full_price) > basePrice
      ? Number(product.full_price)
      : null

  const site = siteUrl()
  const couponUrl = `${site}/coupon/${encodeURIComponent(product.slug)}`
  const location = productLocation({ ...product, supplier })
  const contact = buildSupplierContact(supplier, {
    whatsappMessage: buildRedemptionInquiryText(product.name_he),
  })

  const attributes: { label: string; value: string }[] = []
  if (category) attributes.push({ label: 'קטגוריה', value: category.name_he })
  attributes.push({ label: 'סוג מוצר', value: 'קופון' })

  // The same claim the product page makes, from the same resolved offer.
  const productLd = buildProductJsonLd({
    name: product.name_he,
    description: product.description_he ?? null,
    slug: product.slug,
    sku: product.sku ?? null,
    images,
    siteUrl: site,
    supplierName: supplier?.name ?? null,
    brandName: product.brand ?? null,
    categoryName: category?.name_he ?? null,
    priceIls: null,
    fullPriceIls: null,
    couponOffer,
    stockQuantity: product.stock_quantity ?? null,
    rating,
  })
  const crumbs = [
    { name: 'בית', path: '/' },
    ...(category ? [{ name: category.name_he, path: `/category/${category.slug}` }] : []),
    { name: product.name_he, path: `/coupon/${product.slug}` },
  ]
  const breadcrumbLd = buildBreadcrumbJsonLd(crumbs, site)

  // Inside the storefront chrome, rendered here because the route cannot sit
  // in the `(store)` group: see `components/store/StoreShell.tsx`. The buy
  // column below needs the cart provider the shell mounts.
  return (
    <StoreShell>
      <div data-pdp="container" className="pdp" data-cpn="page">
        <div className="pdp__inner">
          <script
            type="application/ld+json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket so catalogue text cannot close the tag.
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
              page_variant: 'coupon',
            }}
            commerceItem={{
              id: product.id,
              name: product.name_he,
              priceAgorot: Math.round(Number(product.kenyon_price ?? 0) * 100),
              quantity: 1,
              category: category?.name_he ?? null,
              supplier: supplier?.name ?? null,
            }}
          />

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

          <p className="cpn-switch">
            <span className="cpn-eyebrow">קופון</span>
            {' · '}
            <Link href={`/product/${encodeURIComponent(product.slug)}`}>לעמוד המוצר</Link>
          </p>

          <div data-pdp="columns" className="pdp__columns">
            <ProductGallery
              images={images}
              name={product.name_he}
              assets={galleryAssets}
              price={basePrice}
              oldPrice={oldPrice}
            />
            <ProductInfo
              productId={product.id}
              name={product.name_he}
              nameEn={product.name_en}
              basePrice={basePrice}
              oldPrice={oldPrice}
              baseStock={product.stock_quantity}
              scarcitySlot={
                <Suspense fallback={null}>
                  <StockScarcity
                    productId={product.id}
                    trackedLevel={product.stock_quantity}
                    isCoupon
                  />
                </Suspense>
              }
              sku={product.sku}
              categoryName={category?.name_he ?? null}
              city={location.city?.name ?? null}
              attributes={attributes}
              variants={variants ?? []}
              isCoupon
              couponOffer={couponOffer}
              recurringOffer={null}
              rating={rating}
              cashbackPercent={cashbackPercent}
            />
          </div>

          <div className="cpn">
            <CouponVoucherPreview
              name={product.name_he}
              supplierName={supplier?.name ?? null}
              offer={couponOffer}
            />
            <CouponTermsAccordion
              offer={couponOffer}
              terms={product.coupon_terms_he}
              instructions={product.redemption_instructions_he}
            />
            <div className="cpn__full">
              <CouponQrExpiry offer={couponOffer} productUrl={couponUrl} />
            </div>
            <div className="cpn__full">
              <MerchantMap location={location} contact={contact} />
            </div>
            {product.description_he && (
              <section className="cpn__full pdp-details" aria-label="תיאור הקופון">
                <h2 className="pdp-details__title">על הקופון</h2>
                <p className="pdp-details__text">{product.description_he}</p>
              </section>
            )}
            <div className="cpn__full">
              <SimilarCoupons categoryId={product.category_id} excludeId={product.id} />
            </div>
          </div>
        </div>
      </div>
    </StoreShell>
  )
}
