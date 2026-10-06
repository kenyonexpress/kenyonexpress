'use client'

import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import ProductGrid from '@/components/category/ProductGrid'
import type { SortValue } from '@/lib/category-tokens'
import { PRODUCTS_PAGE_SIZE } from '@/lib/products-feed'
import { useCallback, useRef, useState } from 'react'

type FeedResponse = {
  products: CategoryProduct[]
  page: number
  total_count: number
  has_more: boolean
}

export type ProductShopFeedProps = {
  initialProducts: CategoryProduct[]
  hasMore: boolean
  totalCount: number
  sort: SortValue
  priceMin?: number
  priceMax?: number
  productType?: 'coupon' | 'physical'
}

/**
 * Owns isLoading, products[], page, total_count for the shop archive.
 *
 * The first page is server-rendered. Every later page is GET /api/products
 * with the same sort and filters, so a URL change (sort or sidebar) remounts
 * this tree via a key and cannot mix two listings.
 */
export default function ProductShopFeed({
  initialProducts,
  hasMore: initialHasMore,
  totalCount,
  sort,
  priceMin,
  priceMax,
  productType,
}: ProductShopFeedProps) {
  const [products, setProducts] = useState(initialProducts)
  const [page, setPage] = useState(1)
  const [total_count, setTotalCount] = useState(totalCount)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const inflight = useRef(false)

  const onLoadMore = useCallback(() => {
    if (inflight.current || isLoading || !hasMore) return
    inflight.current = true
    setIsLoading(true)
    const nextPage = page + 1
    const params = new URLSearchParams({
      sort,
      page: String(nextPage),
      limit: String(PRODUCTS_PAGE_SIZE),
    })
    if (priceMin != null) params.set('min', String(priceMin))
    if (priceMax != null) params.set('max', String(priceMax))
    if (productType) params.set('type', productType)

    void fetch(`/api/products?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return
        const body = (await res.json()) as FeedResponse
        setProducts((prev) => {
          const seen = new Set(prev.map((item) => item.id))
          return [...prev, ...body.products.filter((item) => !seen.has(item.id))]
        })
        setPage(body.page)
        setTotalCount(body.total_count)
        setHasMore(body.has_more)
      })
      .finally(() => {
        inflight.current = false
        setIsLoading(false)
      })
  }, [hasMore, isLoading, page, priceMax, priceMin, productType, sort])

  return (
    <>
      <ProductGrid
        initialProducts={products}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        isLoading={isLoading}
      />
      {total_count > 0 ? (
        <p className="category-page__count category-page__count--bottom">
          {products.length >= total_count
            ? `מציגים את כל ⁦${total_count}⁩ התוצאות`
            : `מציג ${products.length} מתוך ${total_count} תוצאות`}
        </p>
      ) : null}
    </>
  )
}
