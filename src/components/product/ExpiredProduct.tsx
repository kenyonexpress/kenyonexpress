'use client'

import type { Product } from '@/components/ProductCard'
import ProductCard from '@/components/ProductCard'
import { trackEvent } from '@/lib/observability/posthog'
import Link from 'next/link'
import { useEffect } from 'react'

import '@/styles/product-page.css'

interface ExpiredProductProps {
  product: {
    id: string
    slug: string
    name_he: string
    kenyon_price: number | null
    full_price: number | null
    images: unknown
    category?: { name_he: string; slug: string } | null
  }
  similarProducts: Product[]
}

export default function ExpiredProduct({ product, similarProducts }: ExpiredProductProps) {
  useEffect(() => {
    // Track the expired product view event via PostHog
    trackEvent('expired_product_viewed', { product_slug: product.slug })
  }, [product.slug])

  const basePrice = Number(product.kenyon_price ?? 0)
  const oldPrice =
    product.full_price != null && Number(product.full_price) > basePrice
      ? Number(product.full_price)
      : null

  const firstImage = Array.isArray(product.images)
    ? (product.images as string[]).find((u) => typeof u === 'string' && u.trim() !== '')
    : null

  return (
    <div className="pdp">
      <div className="pdp__inner">
        {/* Breadcrumb */}
        <nav className="pdp-breadcrumb" aria-label="נתיב ניווט">
          <Link href="/" className="tap-area">
            בית
          </Link>
          {product.category && (
            <>
              <span className="pdp-breadcrumb__sep">/</span>
              <Link href={`/category/${product.category.slug}`} className="tap-area">
                {product.category.name_he}
              </Link>
            </>
          )}
          <span className="pdp-breadcrumb__sep">/</span>
          <span>{product.name_he}</span>
        </nav>

        {/* Expired product hero section */}
        <div className="expired-product-hero relative mb-8">
          {/* Grayed out image with ribbon */}
          <div className="relative opacity-60 bg-gray-100 aspect-square flex items-center justify-center rounded-lg overflow-hidden">
            {firstImage && (
              <img src={firstImage} alt={product.name_he} className="w-full h-full object-cover" />
            )}
            {/* "המבצע הסתיים" ribbon */}
            <div className="absolute top-4 -end-8 bg-red-600 text-white px-12 py-2 rotate-45 text-sm font-bold w-48 text-center shadow-md">
              המבצע הסתיים
            </div>
          </div>

          {/* Product info */}
          <div className="mt-4">
            <h1 className="text-2xl mb-2 mt-0">{product.name_he}</h1>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl font-bold">₪{basePrice.toFixed(2)}</span>
              {oldPrice && (
                <span className="text-base text-gray-500 line-through">₪{oldPrice.toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Similar products section */}
        {similarProducts.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl mb-6 mt-8">המבצע הזה כבר לא זמין, הנה 3 מבצעים דומים:</h2>

            {/* Similar products grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {similarProducts.map((similar) => (
                <ProductCard key={similar.id} product={similar} />
              ))}
            </div>

            {/* Category link */}
            {product.category && (
              <Link
                href={`/category/${product.category.slug}`}
                className="inline-block px-6 py-3 bg-blue-500 text-white no-underline rounded font-bold hover:bg-blue-600 transition-colors"
              >
                לכל המבצעים ב{product.category.name_he}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
