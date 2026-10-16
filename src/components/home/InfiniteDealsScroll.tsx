'use client'

import ProductDealCard from '@/components/ProductDealCard'
import { useEffect, useRef, useState } from 'react'

const ITEMS_PER_PAGE = 24

type Product = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  stock_quantity: number | null
  full_price?: number | null
  category?: { name_he: string; slug: string } | null
}

async function fetchDeals(offset: number): Promise<Product[]> {
  const response = await fetch(`/api/deals?offset=${offset}&limit=${ITEMS_PER_PAGE}`)
  if (!response.ok) return []
  return response.json()
}

export default function InfiniteDealsScroll({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [nextOffset, setNextOffset] = useState(initialProducts.length)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialProducts.length >= ITEMS_PER_PAGE)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          setIsLoading(true)
          try {
            const newProducts = await fetchDeals(nextOffset)
            if (newProducts.length === 0 || newProducts.length < ITEMS_PER_PAGE) {
              setHasMore(false)
            }
            if (newProducts.length > 0) {
              setProducts((prev) => [...prev, ...newProducts])
              setNextOffset((prev) => prev + newProducts.length)
            }
          } catch (error) {
            console.error('Failed to load more deals:', error)
            setHasMore(false)
          } finally {
            setIsLoading(false)
          }
        }
      },
      { threshold: 0.1 },
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [nextOffset, hasMore, isLoading])

  return (
    <section
      aria-label="כל המוצרים"
      className="mx-auto w-full max-w-deals px-deals-pad pb-deals-footer-gap md:px-deals-pad-md xl:px-0"
    >
      <div className="jet-listing-grid-deals bg-white">
        {products.map((product) => (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductDealCard product={product} />
          </div>
        ))}
      </div>

      {hasMore && (
        <>
          {isLoading && (
            <div
              className="jet-listing-grid-deals bg-white"
              aria-busy="true"
              aria-label="טוען עוד מוצרים"
            >
              {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map((id) => (
                <div key={id} className="jet-listing-grid-deals__item" data-skeleton>
                  <div className="ke-skeleton aspect-square rounded-elevated" />
                  <div className="mt-3 space-y-2">
                    <div className="ke-skeleton h-4 w-3/4" />
                    <div className="ke-skeleton h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={observerTarget} className="h-4" />
        </>
      )}

      {!hasMore && products.length > 0 && (
        <div className="py-8 text-center">
          <p className="text-muted">סיימנו להציג את כל המוצרים</p>
        </div>
      )}
    </section>
  )
}
