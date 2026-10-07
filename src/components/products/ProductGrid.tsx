'use client'

import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import { SCROLL_SKELETON_COUNT } from '@/lib/products/list-query'
import { useCallback, useEffect, useRef, useState } from 'react'

export type LoadMoreResult = {
  products: CategoryProduct[]
  total_count: number
  has_more?: boolean
}

type Props = {
  initialProducts: CategoryProduct[]
  hasMore: boolean
  onLoadMore: (page: number) => Promise<LoadMoreResult>
  totalCount: number
  page?: number
}

/**
 * Appends the next catalogue page when the sentinel enters the viewport.
 *
 * State lives here (`isLoading`, `products`, `page`, `total_count`) so a
 * sort or filter navigation remounts the grid with a new first page instead
 * of appending a second sort onto the first.
 */
export default function ProductGrid({
  initialProducts,
  hasMore: initialHasMore,
  onLoadMore,
  totalCount,
  page: initialPage = 1,
}: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [products, setProducts] = useState(initialProducts)
  const [page, setPage] = useState(initialPage)
  const [total_count, setTotalCount] = useState(totalCount)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadError, setLoadError] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lockRef = useRef(false)
  const productsRef = useRef(products)
  const onLoadMoreRef = useRef(onLoadMore)
  // The page already in hand. A second intersection can fire after the fetch
  // returns and before React commits `page`, and that second call would ask
  // for the same window, see only duplicates, and stop the scroll.
  const requestedPageRef = useRef(initialPage)
  productsRef.current = products
  onLoadMoreRef.current = onLoadMore

  const load = useCallback(async () => {
    if (lockRef.current || !hasMore) return
    const nextPage = page + 1
    if (nextPage <= requestedPageRef.current) return
    requestedPageRef.current = nextPage
    lockRef.current = true
    setIsLoading(true)
    setLoadError(false)
    try {
      const result = await onLoadMoreRef.current(nextPage)
      const incoming = Array.isArray(result.products) ? result.products : []
      const seen = new Set(productsRef.current.map((item) => item.id))
      const fresh = incoming.filter((item) => !seen.has(item.id))
      if (fresh.length === 0) {
        if (incoming.length === 0 || result.has_more === false) setHasMore(false)
        return
      }
      const merged = [...productsRef.current, ...fresh]
      const total = typeof result.total_count === 'number' ? result.total_count : total_count
      productsRef.current = merged
      setProducts(merged)
      setPage(nextPage)
      setTotalCount(total)
      setHasMore(typeof result.has_more === 'boolean' ? result.has_more : merged.length < total)
    } catch {
      requestedPageRef.current = page
      setLoadError(true)
    } finally {
      lockRef.current = false
      setIsLoading(false)
    }
  }, [hasMore, page, total_count])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loadError) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadError, load])

  return (
    <>
      <ul
        className="category-products"
        data-page={page}
        data-total-count={total_count}
        data-loading={isLoading ? 'true' : 'false'}
      >
        {products.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product} />
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {isLoading ? 'טוען מוצרים נוספים' : ''}
      </p>
      {isLoading ? <CategoryGridSkeleton count={SCROLL_SKELETON_COUNT} unclipped /> : null}
      {loadError && !isLoading ? (
        <button
          type="button"
          className="product-grid__retry mt-3 cursor-pointer rounded-lg border border-[var(--cat-line)] bg-[var(--cat-surface)] py-2 ps-4 pe-4 text-sm text-[var(--cat-ink)]"
          onClick={() => void load()}
        >
          נסו שוב
        </button>
      ) : null}
      {hasMore ? (
        <div ref={sentinelRef} className="product-grid__sentinel h-px" aria-hidden="true" />
      ) : null}
    </>
  )
}
