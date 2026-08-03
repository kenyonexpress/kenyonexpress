import ViewTracker from '@/components/analytics/ViewTracker'
import { CouponTerms } from '@/components/storefront/CouponPricing'
import ProductGallery from '@/components/storefront/ProductGallery'
import ProductInfo from '@/components/storefront/ProductInfo'
import RelatedProducts from '@/components/storefront/RelatedProducts'
import ShippingInfo from '@/components/storefront/ShippingInfo'
import SupplierInfo from '@/components/storefront/SupplierInfo'
import { listProductSlugsForPrerender, loadProductBySlug } from '@/lib/product-detail'
import { getProductSeoBySlug } from '@/lib/product-seo'
import { buildBreadcrumbJsonLd, buildProductJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
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
 * Prerendered at build time, capped. See `listProductSlugsForPrerender`.
 */
export async function generateStaticParams() {
  const slugs = await listProductSlugsForPrerender()
  return slugs.map((slug) => ({ slug }))
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
 * The product itself is now static too: `generateStaticParams` above plus
 * `use cache` in `lib/product-detail.ts`, on a catalogue client that does not
 * read cookies. This fallback still matters for a long-tail slug past the
 * prerender cap, which renders on first request.
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

  // One cached call instead of four per-request queries. See product-detail.ts
  // for why: none of this is per-shopper, and reading it through the
  // cookie-reading client is what made this page 1.2-1.9s hot under L1 in [41]
  // while the home page answered in 6ms.
  const detail = await loadProductBySlug(slug)
  if (!detail) notFound()

  const { product, images, supplier, variants, galleryAssets, couponOffer } = detail

  const category = Array.isArray(product.categories)
    ? null
    : (product.categories as { id: string; name_he: string; slug: string } | null)

  const basePrice = Number(product.kenyon_price ?? 0)
  const oldPrice =
    product.full_price != null && Number(product.full_price) > basePrice
      ? Number(product.full_price)
      : null

  const isCoupon = product.type === 'coupon' || product.is_coupon_enabled

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
