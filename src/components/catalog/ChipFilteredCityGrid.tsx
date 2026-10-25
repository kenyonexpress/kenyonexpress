'use client'

import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import type { ChipFilterable } from '@/lib/catalog/deal-chips'
import {
  type CategoryFilterable,
  matchesCategoryFilters,
  parseCategoryFilterChips,
} from '@/lib/category-filter-chips'
import { useSearchParams } from 'next/navigation'

/**
 * The city grid with the chips applied in the browser. The city page's data is
 * one cached read of at most 60 rows, so filtering here keeps the page static
 * and the cache key single, instead of one cached read per chip combination.
 * F63: extended to support all four category filter chips.
 */
export default function ChipFilteredCityGrid({
  products,
  cityName,
}: {
  products: (CategoryProduct & ChipFilterable & CategoryFilterable)[]
  cityName: string
}) {
  const filters = parseCategoryFilterChips(useSearchParams())
  const shown = products.filter((p) => matchesCategoryFilters(p, filters))
  if (shown.length === 0) {
    return (
      <div className="category-page__empty">
        <p>
          {products.length === 0
            ? `עדיין אין דילים ב${cityName}.`
            : 'אין דילים שמתאימים לסינון. אפשר לבטל אחד המסננים.'}
        </p>
      </div>
    )
  }
  return (
    <ul className="category-products">
      {shown.map((product) => (
        <li key={product.id} className="category-products__item">
          <CategoryProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
