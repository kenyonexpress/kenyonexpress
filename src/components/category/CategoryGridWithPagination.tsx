'use client'

import CategoryProductCard, { type CategoryProduct } from './CategoryProductCard'
import Pagination from './Pagination'

type ViewMode = '4-col' | '3-col' | '2-col' | 'list'

type Props = {
  items: CategoryProduct[]
  currentPage: number
  totalPages: number
  categorySlug: string
  params: Record<string, string | undefined>
  viewMode?: ViewMode
}

export default function CategoryGridWithPagination({
  items,
  currentPage,
  totalPages,
  categorySlug,
  params,
  viewMode = '4-col',
}: Props) {
  return (
    <>
      <ul className={`category-products category-products--${viewMode}`}>
        {items.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product} />
          </li>
        ))}
      </ul>

      <Pagination
        pathname={`/category/${categorySlug}`}
        params={params}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </>
  )
}
