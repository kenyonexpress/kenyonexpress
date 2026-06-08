import ProductGallery from '@/components/storefront/ProductGallery'
import ProductInfo from '@/components/storefront/ProductInfo'
import RelatedProducts from '@/components/storefront/RelatedProducts'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('name_he, description_he')
    .eq('slug', slug)
    .single()
  return {
    title: data?.name_he ?? 'מוצר',
    description: data?.description_he ?? undefined,
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, description_he,
       kenyon_price, full_price, is_coupon_enabled,
       type, sku, images, stock_quantity, category_id,
       categories(id, name_he, slug)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single()

  if (!product) notFound()

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

  const category = Array.isArray(product.categories)
    ? null
    : (product.categories as { id: string; name_he: string; slug: string } | null)

  const basePrice = Number(product.kenyon_price ?? 0)
  const oldPrice =
    product.full_price != null && Number(product.full_price) > basePrice
      ? Number(product.full_price)
      : null

  const attributes: { label: string; value: string }[] = []
  if (category) attributes.push({ label: 'קטגוריה', value: category.name_he })
  attributes.push({
    label: 'סוג מוצר',
    value: product.type === 'coupon' ? 'קופון' : 'מוצר פיזי',
  })

  return (
    <div className="max-w-page mx-auto px-4 py-6 space-y-8">
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
        <div className="grid md:grid-cols-2 gap-8">
          <ProductGallery images={images} name={product.name_he} />
          <ProductInfo
            name={product.name_he}
            nameEn={product.name_en}
            basePrice={basePrice}
            oldPrice={oldPrice}
            baseStock={product.stock_quantity}
            sku={product.sku}
            description={product.description_he}
            attributes={attributes}
            variants={variants ?? []}
            isCoupon={product.is_coupon_enabled}
          />
        </div>
      </div>

      {/* Related products */}
      {product.category_id && (
        <RelatedProducts categoryId={product.category_id} excludeId={product.id} />
      )}
    </div>
  )
}
