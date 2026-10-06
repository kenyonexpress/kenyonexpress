'use client'

import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import LoadMoreSentinel from '@/components/category/LoadMoreSentinel'

export type ProductGridProps = {
  initialProducts: CategoryProduct[]
  hasMore: boolean
  onLoadMore: () => void
  isLoading?: boolean
}

/**
 * The shop archive grid. First paint is the server list; further pages arrive
 * through onLoadMore, which the sentinel fires when it reaches the viewport.
 */
export default function ProductGrid({
  initialProducts,
  hasMore,
  onLoadMore,
  isLoading = false,
}: ProductGridProps) {
  if (initialProducts.length === 0 && !isLoading) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      </div>
    )
  }

  return (
    <>
      {initialProducts.length > 0 ? (
        <ul className="category-products">
          {initialProducts.map((product) => (
            <li key={product.id} className="category-products__item">
              <CategoryProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : null}
      {isLoading ? <CategoryGridSkeleton count={6} /> : null}
      {hasMore && !isLoading ? <LoadMoreSentinel onLoadMore={onLoadMore} /> : null}
    </>
  )
}
