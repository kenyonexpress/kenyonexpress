import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ProductGallery from './ProductGallery'
import VariantSelector from './VariantSelector'

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
       type, images, stock_quantity, is_featured, category_id,
       categories(id, name_he, slug)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (!product) notFound()

  const [{ data: variants }, { data: related }] = await Promise.all([
    supabase
      .from('product_variants')
      .select('id, name_he, price, price_modifier, stock_quantity, is_active, sku')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .is('deleted_at', null),
    product.category_id
      ? supabase
          .from('products')
          .select('id, slug, name_he, kenyon_price, images, stock_quantity')
          .eq('status', 'active')
          .eq('category_id', product.category_id)
          .neq('id', product.id)
          .limit(4)
      : Promise.resolve({ data: [] }),
  ])

  const images = Array.isArray(product.images)
    ? (product.images as string[]).filter((u) => typeof u === 'string')
    : []

  const category = Array.isArray(product.categories)
    ? null
    : (product.categories as { id: string; name_he: string; slug: string } | null)

  const hasDiscount =
    product.full_price != null &&
    product.kenyon_price != null &&
    product.full_price > product.kenyon_price

  const discountPct = hasDiscount
    ? Math.round((1 - (product.kenyon_price ?? 0) / (product.full_price ?? 1)) * 100)
    : 0

  return (
    <div className="max-w-[1320px] mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav
        className="text-sm text-gray-500 flex items-center gap-1 flex-wrap"
        aria-label="נתיב ניווט"
      >
        <Link href="/" className="hover:text-brand">
          בית
        </Link>
        <span>/</span>
        <Link href="/products" className="hover:text-brand">
          מוצרים
        </Link>
        {category && (
          <>
            <span>/</span>
            <Link href={`/categories/${category.slug}`} className="hover:text-brand">
              {category.name_he}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-gray-800 font-medium">{product.name_he}</span>
      </nav>

      {/* Main product card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ProductGallery images={images} name={product.name_he} />

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-snug">{product.name_he}</h1>
            {product.name_en && (
              <p className="text-sm text-gray-400 mt-0.5" dir="ltr">
                {product.name_en}
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold text-brand">
              ₪{Number(product.kenyon_price).toFixed(2)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-base text-gray-400 line-through">
                  ₪{Number(product.full_price).toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  -{discountPct}%
                </span>
              </>
            )}
          </div>

          {/* Coupon banner */}
          {product.is_coupon_enabled && product.kenyon_price != null && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-amber-800">ניתן לרכישה כקופון</p>
              <p className="text-amber-700 mt-0.5">
                שלם ₪{(product.kenyon_price * 0.1).toFixed(2)} עכשיו (10%) ואת השאר בחנות
              </p>
            </div>
          )}

          {/* Description */}
          {product.description_he && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-1">תיאור המוצר</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {product.description_he}
              </p>
            </div>
          )}

          <VariantSelector
            basePrice={product.kenyon_price}
            variants={variants ?? []}
            stock={product.stock_quantity}
            isCoupon={product.is_coupon_enabled}
          />
        </div>
      </div>

      {/* Related products */}
      {related && related.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-800 mb-3">מוצרים נוספים מאותה קטגוריה</h2>
          <div className="grid grid-cols-2 gap-3">
            {related.map((p) => {
              const thumb =
                Array.isArray(p.images) && typeof (p.images as Json[])[0] === 'string'
                  ? ((p.images as Json[])[0] as string)
                  : null
              return (
                <Link
                  key={p.id}
                  href={`/products/${p.slug}`}
                  className="block bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    {thumb ? (
                      <img src={thumb} alt={p.name_he} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">📦</span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.name_he}</p>
                    <p className="text-brand font-bold mt-1">
                      ₪{Number(p.kenyon_price).toFixed(2)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
