'use client'

import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import ProductGrid, { type LoadMoreResult } from '@/components/products/ProductGrid'
import { PRODUCTS_PAGE_LIMIT, type ShopListQuery } from '@/lib/products/list-query'
import { useCallback } from 'react'

type Props = {
  initialProducts: CategoryProduct[]
  hasMore: boolean
  totalCount: number
  page: number
  query: ShopListQuery
}

/**
 * The shop's loader. The grid only knows `onLoadMore`; this is the piece
 * that asks `GET /api/products` for the next window with the same sort and
 * filters the page was rendered with.
 */
export default function ShopProductGrid({
  initialProducts,
  hasMore,
  totalCount,
  page,
  query,
}: Props) {
  const onLoadMore = useCallback(
    async (nextPage: number): Promise<LoadMoreResult> => {
      const params = new URLSearchParams()
      params.set('page', String(nextPage))
      params.set('limit', String(PRODUCTS_PAGE_LIMIT))
      if (query.sort !== 'menu_order') params.set('sort', query.sort)
      if (query.min != null) params.set('min', String(query.min))
      if (query.max != null) params.set('max', String(query.max))
      if (query.type) params.set('type', query.type)

      const response = await fetch(`/api/products?${params.toString()}`)
      if (!response.ok) throw new Error('products_list_failed')
      const body = (await response.json()) as Partial<LoadMoreResult>
      if (!Array.isArray(body.products) || typeof body.total_count !== 'number') {
        throw new Error('products_list_failed')
      }
      return {
        products: body.products,
        total_count: body.total_count,
        has_more: body.has_more,
      }
    },
    [query.min, query.max, query.sort, query.type],
  )

  return (
    <ProductGrid
      initialProducts={initialProducts}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      totalCount={totalCount}
      page={page}
    />
  )
}
