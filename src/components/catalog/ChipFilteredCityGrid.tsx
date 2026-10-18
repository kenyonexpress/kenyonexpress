'use client'

import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import { type ChipFilterable, matchesChips, parseDealChips } from '@/lib/catalog/deal-chips'
import { useSearchParams } from 'next/navigation'

/**
 * The city grid with the chips applied in the browser. The city page's data is
 * one cached read of at most 60 rows, so filtering here keeps the page static
 * and the cache key single, instead of one cached read per chip combination.
 */
export default function ChipFilteredCityGrid({
  products,
  cityName,
}: {
  products: (CategoryProduct & ChipFilterable)[]
  cityName: string
}) {
  const chips = parseDealChips(useSearchParams())
  const shown = products.filter((p) => matchesChips(p, chips))
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
