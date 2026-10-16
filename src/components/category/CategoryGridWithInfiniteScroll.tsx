'use client'

import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { useCallback, useState } from 'react'
import CategoryGridSkeleton from './CategoryGridSkeleton'
import CategoryProductCard, { type CategoryProduct } from './CategoryProductCard'
import InfiniteScrollLoader from './InfiniteScrollLoader'

type Props = {
  initialItems: CategoryProduct[]
  totalCount: number
  currentPage: number
  pageSize: number
  categorySlug: string
  params: Record<string, string | undefined>
}

export default function CategoryGridWithInfiniteScroll({
  initialItems,
  totalCount,
  currentPage,
  pageSize,
  categorySlug,
  params,
}: Props) {
  const [items, setItems] = useState<CategoryProduct[]>(initialItems)
  const [page, setPage] = useState(currentPage)
  const [isLoading, setIsLoading] = useState(false)

  const hasMore = page * pageSize < totalCount

  const handleLoadMore = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)

    try {
      const nextPage = page + 1
      const qs = new URLSearchParams()

      for (const [key, value] of Object.entries(params)) {
        if (value) {
          qs.set(key, value)
        }
      }
      qs.set('page', String(nextPage))

      const response = await fetchWithTimeout(
        `/api/category/${categorySlug}/products?${qs.toString()}`,
      )
      if (!response.ok) throw new Error('Failed to load more items')

      const { items: nextItems } = (await response.json()) as { items: CategoryProduct[] }
      setItems((prevItems) => [...prevItems, ...nextItems])
      setPage(nextPage)
    } catch (err) {
      // Silently fail on pagination; server will retry on next scroll
    } finally {
      setIsLoading(false)
    }
  }, [page, hasMore, isLoading, categorySlug, params])

  return (
    <>
      <ul className="category-products">
        {items.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product} />
          </li>
        ))}
      </ul>

      {isLoading && <CategoryGridSkeleton count={pageSize} />}

      <InfiniteScrollLoader onLoadMore={handleLoadMore} isLoading={isLoading} hasMore={hasMore} />

      {!hasMore && items.length > 0 && (
        <p className="category-page__empty">סיימנו! הראינו את כל המוצרים בקטגוריה זו.</p>
      )}
    </>
  )
}
