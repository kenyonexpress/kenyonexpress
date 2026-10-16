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
        <div
          className="expired-product-hero"
          style={{ position: 'relative', marginBottom: '2rem' }}
        >
          {/* Grayed out image with ribbon */}
          <div
            style={{
              position: 'relative',
              opacity: 0.6,
              backgroundColor: '#f0f0f0',
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.5rem',
              overflow: 'hidden',
            }}
          >
            {firstImage && (
              <img
                src={firstImage}
                alt={product.name_he}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
            {/* "המבצע הסתיים" ribbon */}
            <div
              style={{
                position: 'absolute',
                top: '1rem',
                insetInlineEnd: '-2rem',
                backgroundColor: '#d32f2f',
                color: 'white',
                padding: '0.5rem 3rem',
                transform: 'rotate(45deg)',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                width: '12rem',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              המבצע הסתיים
            </div>
          </div>

          {/* Product info */}
          <div style={{ marginTop: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', marginTop: 0 }}>
              {product.name_he}
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                ₪{basePrice.toFixed(2)}
              </span>
              {oldPrice && (
                <span style={{ fontSize: '1rem', color: '#999', textDecoration: 'line-through' }}>
                  ₪{oldPrice.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Similar products section */}
        {similarProducts.length > 0 && (
          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', marginTop: '2rem' }}>
              המבצע הזה כבר לא זמין, הנה 3 מבצעים דומים:
            </h2>

            {/* Similar products grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                marginBottom: '2rem',
              }}
            >
              {similarProducts.map((similar) => (
                <ProductCard key={similar.id} product={similar} />
              ))}
            </div>

            {/* Category link */}
            {product.category && (
              <Link
                href={`/category/${product.category.slug}`}
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#007bff',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '0.25rem',
                  fontWeight: 'bold',
                }}
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
