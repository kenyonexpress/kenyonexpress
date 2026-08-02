import ViewTracker from '@/components/analytics/ViewTracker'
import { CouponTerms } from '@/components/storefront/CouponPricing'
import ProductGallery from '@/components/storefront/ProductGallery'
import ProductInfo from '@/components/storefront/ProductInfo'
import RelatedProducts from '@/components/storefront/RelatedProducts'
import ShippingInfo from '@/components/storefront/ShippingInfo'
import SupplierInfo from '@/components/storefront/SupplierInfo'
import { type CouponOffer, buildCouponOffer } from '@/lib/commerce/coupon-offer'
import { buildBreadcrumbJsonLd, buildProductJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readOptionalColumns,
} from '@/lib/supabase/optional-columns'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

/** ISR: product pages refresh at most every 2 minutes (SEO-PERFORMANCE §1.1). */
export const revalidate = 120

export async function generateStaticParams() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('products')
    .select('slug')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('slug', 'is', null)
    .limit(500)
  return (data ?? []).map((row) => ({ slug: row.slug as string }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('products')
    .select(
      'name_he, description_he, short_description_he, seo_title, seo_description, images, kenyon_price, type, is_coupon_enabled',
    )
    .eq('slug', slug)
    .single()

  const name = data?.name_he ?? 'מוצר'
  const onSite = Number(data?.kenyon_price ?? 0)
  const priceTitle = data?.seo_title ?? (onSite > 0 ? `${name} ב-${onSite.toFixed(0)} ש"ח` : name)
  const description =
    data?.seo_description ?? data?.short_description_he ?? data?.description_he ?? undefined
  const path = `/product/${encodeURIComponent(slug)}`
  const images = Array.isArray(data?.images) ? (data.images as string[]).filter(Boolean) : []

  return {
    title: priceTitle,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: priceTitle,
      description,
      url: path,
      type: 'website',
      locale: 'he_IL',
      siteName: 'קניון אקספרס',
      ...(images[0] ? { images: [{ url: images[0] as string }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: priceTitle,
      description,
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = createPublicClient()

  const { data: product } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, description_he,
       kenyon_price, full_price, price_ils, is_coupon_enabled,
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

  const couponOffer: CouponOffer | null = isCoupon
    ? buildCouponOffer({
        // price_ils is the sticker price the business would charge; full_price
        // is the legacy column and is used only when price_ils is unset.
        fullPriceIls: product.price_ils ?? product.full_price ?? basePrice,
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

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const productLd = buildProductJsonLd({
    name: product.name_he,
    description: product.description_he ?? null,
    slug: product.slug,
    sku: product.sku,
    images,
    siteUrl,
    supplierName: supplier?.name ?? null,
    categoryName: category?.name_he ?? null,
    priceIls: isCoupon ? null : basePrice,
    fullPriceIls: isCoupon ? null : oldPrice,
    couponOffer,
    stockQuantity: product.stock_quantity,
  })
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      ...(category ? [{ name: category.name_he, path: `/category/${category.slug}` }] : []),
      { name: product.name_he, path: `/product/${encodeURIComponent(product.slug)}` },
    ],
    siteUrl,
  )

  return (
    <div data-pdp="container" className="max-w-page mx-auto px-4 py-6 space-y-8">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD; jsonLdScript escapes < */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(productLd) }}
      />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD; jsonLdScript escapes < */}
      <script
        type="application/ld+json"
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

      {/* Breadcrumb */}
      <nav
        className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap"
        aria-label="נתיב ניווט"
      >
        <Link href="/" className="hover:text-brand-dark">
          בית
        </Link>
        {category && (
          <>
            <span className="text-gray-300">/</span>
            <Link href={`/category/${category.slug}`} className="hover:text-brand-dark">
              {category.name_he}
            </Link>
          </>
        )}
        <span className="text-gray-300">/</span>
        <span className="text-brand-dark font-medium">{product.name_he}</span>
      </nav>

      {/* Two columns: gallery (right in RTL) + info (left) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 lg:p-8">
        <div data-pdp="columns" className="grid md:grid-cols-[5fr_7fr] gap-8">
          <ProductGallery images={images} name={product.name_he} assets={galleryAssets} />
          <ProductInfo
            productId={product.id}
            name={product.name_he}
            nameEn={product.name_en}
            basePrice={basePrice}
            oldPrice={oldPrice}
            baseStock={product.stock_quantity}
            sku={product.sku}
            description={product.description_he}
            attributes={attributes}
            variants={variants ?? []}
            isCoupon={isCoupon}
            couponOffer={couponOffer}
          />
        </div>
      </div>

      {/* Coupon-only: how and by when the voucher may be redeemed. */}
      {couponOffer && (
        <CouponTerms
          offer={couponOffer}
          terms={product.coupon_terms_he}
          instructions={product.redemption_instructions_he}
        />
      )}

      {/* Physical-only: shipping and delivery. The platform/supplier split is
          deliberately NOT shown — it is an internal settlement detail and the
          customer pays the full price either way. */}
      {!isCoupon && (
        <ShippingInfo
          requiresShipping={product.requires_shipping}
          weightGrams={product.weight_grams}
          warrantyMonths={product.warranty_months}
        />
      )}

      {/* Supplier details: rendered for every product (coupon and physical) */}
      <SupplierInfo supplier={supplier} productType={product.type} />

      {/* Related products */}
      <RelatedProducts categoryId={product.category_id} excludeId={product.id} />
    </div>
  )
}
