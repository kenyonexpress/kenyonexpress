'use client'

import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import {
  type CategoryFilterable,
  matchesCategoryFilters,
  parseCategoryFilterChips,
} from '@/lib/category-filter-chips'
import { useSearchParams } from 'next/navigation'
import CategoryGridWithInfiniteScroll from './CategoryGridWithInfiniteScroll'
import CategoryGridWithPagination from './CategoryGridWithPagination'

/**
 * F63: Client-side filter wrapper for category grids.
 * Applies the four filter chips on top of server-rendered results.
 */
export default function CategoryFilteredGrid({
  items,
  total,
  currentPage,
  totalPages,
  pageSize,
  categorySlug,
  params,
  usePagination,
}: {
  items: (CategoryProduct & CategoryFilterable)[]
  total: number
  currentPage: number
  totalPages: number
  pageSize: number
  categorySlug: string
  params: Record<string, string | undefined>
  usePagination?: boolean
}) {
  const searchParams = useSearchParams()
  const filters = parseCategoryFilterChips(searchParams)
  const filtered = items.filter((p) => matchesCategoryFilters(p, filters))

  if (filtered.length === 0 && items.length > 0) {
    return (
      <div className="category-page__empty">
        <p>אין מוצרים שמתאימים לסינון. אפשר לבטל אחד המסננים.</p>
      </div>
    )
  }

  if (usePagination) {
    return (
      <CategoryGridWithPagination
        items={filtered}
        currentPage={currentPage}
        totalPages={totalPages}
        categorySlug={categorySlug}
        params={params}
      />
    )
  }

  return (
    <CategoryGridWithInfiniteScroll
      initialItems={filtered}
      totalCount={total}
      currentPage={currentPage}
      pageSize={pageSize}
      categorySlug={categorySlug}
      params={params}
    />
  )
}
