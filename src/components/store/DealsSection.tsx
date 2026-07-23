'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatCountdown(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)} : ${pad(m)} : ${pad(s)}`
}

const INITIAL_SECONDS = 23 * 3600 + 59 * 60 + 59

export default function DealsSection({ products }: { products: Product[] }) {
  const [remaining, setRemaining] = useState(INITIAL_SECONDS)

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section aria-label="דילים של היום" className="max-w-page mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 rounded-t-lg bg-brand-dark px-4 py-3 text-white">
        <h2 className="text-[22px] font-black tracking-wide">דילים של היום</h2>

        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-300">
          <span>מסתיים בעוד:</span>
          <span
            dir="ltr"
            className="rounded bg-brand-secondary px-3 py-1 font-mono text-base font-black tracking-widest text-brand-dark"
          >
            {formatCountdown(remaining)}
          </span>
        </div>

        <Link
          href="/products"
          className="flex items-center gap-1 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors"
        >
          לכל המבצעים
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-b-lg border border-t-0 border-border bg-white">
        {products.length > 0 ? (
          <div className="jet-listing-grid-deals">
            {products.map((product) => (
              <div key={product.id} className="jet-listing-grid-deals__item">
                <ProductCard product={product} variant="deals" />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-gray-500">אין דילים להצגה כרגע</p>
        )}
      </div>
    </section>
  )
}
