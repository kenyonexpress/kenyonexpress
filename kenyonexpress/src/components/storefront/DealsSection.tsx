'use client'

import type { Product } from '@/components/ProductCard'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  products: (Product & { full_price?: number | null })[]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function StarRating({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`דירוג ${count} מתוך 5`}>
      {(['s1', 's2', 's3', 's4', 's5'] as const).map((k, i) => (
        <svg
          key={k}
          aria-hidden="true"
          className={`w-3.5 h-3.5 ${i < count ? 'text-brand-primary' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export default function DealsSection({ products }: Props) {
  const INITIAL_SECONDS = 23 * 3600 + 59 * 60 + 59
  const [remaining, setRemaining] = useState(INITIAL_SECONDS)

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (products.length === 0) return null

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between border-b-2 border-brand-primary pb-2">
        {/* Left side: timer + link */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 bg-brand-primary text-brand-dark text-xs font-black px-3 py-1.5 rounded-full">
            <span aria-hidden="true">⏱</span>
            מסתיים בעוד: {formatTime(remaining)}
          </span>
          <Link
            href="/products"
            className="text-sm text-gray-500 hover:text-brand-dark transition-colors"
          >
            לכל הדילים ←
          </Link>
        </div>
        {/* Right side: title */}
        <h2 className="text-lg font-black text-gray-900">דילים של היום 🔥</h2>
      </div>

      {/* Product grid — 4 columns at desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {products.map((product) => {
          const thumb =
            Array.isArray(product.images) && typeof product.images[0] === 'string'
              ? (product.images[0] as string)
              : null

          const hasDiscount =
            product.full_price != null &&
            product.kenyon_price != null &&
            product.full_price > (product.kenyon_price ?? 0)

          const discountPct = hasDiscount && product.full_price
            ? Math.round((1 - (product.kenyon_price ?? 0) / product.full_price) * 100)
            : 0

          const outOfStock = product.stock_quantity === 0

          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="group block bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg hover:border-brand-primary transition-all"
            >
              {/* Image */}
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={product.name_he}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">📦</div>
                )}
                {hasDiscount && discountPct > 0 && (
                  <span className="absolute top-2 start-2 bg-price text-white text-[10px] font-black px-1.5 py-0.5 rounded">
                    -{discountPct}%
                  </span>
                )}
                {outOfStock && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full border">
                      אזל המלאי
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1.5">
                <p className="text-sm font-medium text-blue-700 hover:text-blue-900 line-clamp-2 leading-snug">
                  {product.name_he}
                </p>
                <StarRating count={4} />
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-price">
                    ₪{Number(product.kenyon_price ?? 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                  </span>
                  {hasDiscount && product.full_price && (
                    <span className="text-xs text-gray-400 line-through">
                      ₪{Number(product.full_price).toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                <div className="pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="block w-full text-center text-xs font-bold py-1.5 rounded bg-brand-primary text-brand-dark hover:bg-brand-primary-hover">
                    הוסף לסל
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
