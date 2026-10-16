'use client'

import { useCallback, useState } from 'react'
import CategoryGridSkeleton from './CategoryGridSkeleton'
import CategoryProductCard, { type CategoryProduct } from './CategoryProductCard'
import InfiniteScrollLoader from './InfiniteScrollLoader'

type Props = {
  initialItems: CategoryProduct[]
  totalCount: number
  currentPage: number
  pageSize: number
  pathname: string
  params: Record<string, string | undefined>
  fetchNextPage: (page: number) => Promise<CategoryProduct[]>
}

export default function CategoryGridWithInfiniteScroll({
  initialItems,
  totalCount,
  currentPage,
  pageSize,
  pathname,
  params,
  fetchNextPage,
}: Props) {
  const [items, setItems] = useState<CategoryProduct[]>(initialItems)
  const [page, setPage] = useState(currentPage)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMore = page * pageSize < totalCount

  const handleLoadMore = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    setError(null)

    try {
      const nextPage = page + 1
      const nextItems = await fetchNextPage(nextPage)
      setItems((prevItems) => [...prevItems, ...nextItems])
      setPage(nextPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more items')
    } finally {
      setIsLoading(false)
    }
  }, [page, hasMore, isLoading, fetchNextPage])

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

      {error && (
        <p className="category-page__error" role="alert">
          {error}
        </p>
      )}

      <InfiniteScrollLoader onLoadMore={handleLoadMore} isLoading={isLoading} hasMore={hasMore} />

      {!hasMore && items.length > 0 && (
        <p className="category-page__empty">סיימנו! הראינו את כל המוצרים בקטגוריה זו.</p>
      )}
    </>
  )
}
