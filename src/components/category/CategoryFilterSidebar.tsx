'use client'

import CategoryAutocomplete from '@/components/category/CategoryAutocomplete'
import { DISCOUNT_STEPS } from '@/lib/discount-percent'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

export type SidebarCategory = { slug: string; name_he: string }

type Props = {
  categories: SidebarCategory[]
  currentSlug?: string
  priceMin?: number
  priceMax?: number
  productType?: 'coupon' | 'physical'
  /**
   * The distinct brands in this archive. The widget renders only when there
   * is at least one: a "brand" heading over an empty list is a promise the
   * catalogue cannot keep, and on production today every brand is null.
   */
  brands?: string[]
  /** The selected brand, from `parseBrand`. */
  brand?: string
  /** The selected minimum saving, from `parseMinDiscount`. */
  minDiscount?: number
}

const TYPE_OPTIONS = [
  { value: undefined, label: 'הכל' },
  { value: 'coupon' as const, label: 'קופונים' },
  { value: 'physical' as const, label: 'מוצרים פיזיים' },
]

/**
 * The percent, isolated so it reads left-to-right inside a Hebrew label. The
 * result-count line does the same for its digits.
 */
function discountLabel(step: number): string {
  return `לפחות \u2066${step}%\u2069 הנחה`
}

export default function CategoryFilterSidebar({
  categories,
  currentSlug,
  priceMin,
  priceMax,
  productType,
  brands = [],
  brand,
  minDiscount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [min, setMin] = useState(priceMin != null ? String(priceMin) : '')
  const [max, setMax] = useState(priceMax != null ? String(priceMax) : '')
  const current = currentSlug ? categories.find((c) => c.slug === currentSlug) : undefined

  /** Any filter change resets paging: page 3 of the old result set is meaningless. */
  function pushWith(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams)
    mutate(params)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function applyPrice(e: React.FormEvent) {
    e.preventDefault()
    pushWith((params) => {
      if (min && Number(min) >= 0) params.set('min', min)
      else params.delete('min')
      if (max && Number(max) >= 0) params.set('max', max)
      else params.delete('max')
    })
  }

  function applyType(value: 'coupon' | 'physical' | undefined) {
    pushWith((params) => {
      if (value) params.set('type', value)
      else params.delete('type')
    })
  }

  function applyBrand(value: string | undefined) {
    pushWith((params) => {
      if (value) params.set('brand', value)
      else params.delete('brand')
    })
  }

  function applyDiscount(value: number | undefined) {
    pushWith((params) => {
      if (value) params.set('discount', String(value))
      else params.delete('discount')
    })
  }

  // A brand chosen by URL that the facet no longer lists (the product moved
  // or was retired) still shows as selected, so the shopper can clear it.
  const brandOptions = brand && !brands.includes(brand) ? [brand, ...brands] : brands

  return (
    <aside id="category-filters" className="category-sidebar" aria-label="סינון מוצרים">
      {/* Collapsed by default. The live archive has no filter UI at all, so an
          always-open panel would push our footer far below live's (y871) and
          cost more in the comparison than the column ever did. Closed, it is a
          single row; open, it is the full filter set. */}
      <details className="category-sidebar__disclosure">
        <summary className="category-sidebar__summary">סינון מוצרים</summary>
        <div className="category-sidebar__widgets">
          {/* The archive-scoped field, distinct from the site search in the
              header. See the note at the top of CategoryAutocomplete.tsx and
              layout/search-ui.test.ts. Absent on /products, which has no
              category to scope to. */}
          {current ? (
            <div className="category-sidebar__widget">
              <CategoryAutocomplete categorySlug={current.slug} categoryName={current.name_he} />
            </div>
          ) : null}

          <div className="category-sidebar__widget">
            <h3 className="category-sidebar__title">קטגוריות</h3>
            <ul className="category-sidebar__list">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/category/${cat.slug}`}
                    className={cat.slug === currentSlug ? 'is-current' : undefined}
                  >
                    {cat.name_he}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="category-sidebar__widget">
            <h3 className="category-sidebar__title">סוג מוצר</h3>
            <ul className="category-sidebar__list">
              {TYPE_OPTIONS.map((option) => (
                <li key={option.label}>
                  <button
                    type="button"
                    className={`category-sidebar__filter-btn${
                      productType === option.value ? ' is-current' : ''
                    }`}
                    onClick={() => applyType(option.value)}
                    disabled={isPending}
                    aria-pressed={productType === option.value}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {brandOptions.length > 0 ? (
            <div className="category-sidebar__widget" data-facet="brand">
              <h3 className="category-sidebar__title">מותג</h3>
              <ul className="category-sidebar__list">
                <li>
                  <button
                    type="button"
                    className={`category-sidebar__filter-btn${brand ? '' : ' is-current'}`}
                    onClick={() => applyBrand(undefined)}
                    disabled={isPending}
                    aria-pressed={!brand}
                  >
                    הכל
                  </button>
                </li>
                {brandOptions.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      className={`category-sidebar__filter-btn${
                        brand === option ? ' is-current' : ''
                      }`}
                      onClick={() => applyBrand(option)}
                      disabled={isPending}
                      aria-pressed={brand === option}
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="category-sidebar__widget" data-facet="discount">
            <h3 className="category-sidebar__title">הנחה</h3>
            <ul className="category-sidebar__list">
              <li>
                <button
                  type="button"
                  className={`category-sidebar__filter-btn${minDiscount ? '' : ' is-current'}`}
                  onClick={() => applyDiscount(undefined)}
                  disabled={isPending}
                  aria-pressed={!minDiscount}
                >
                  הכל
                </button>
              </li>
              {DISCOUNT_STEPS.map((step) => (
                <li key={step}>
                  <button
                    type="button"
                    className={`category-sidebar__filter-btn${
                      minDiscount === step ? ' is-current' : ''
                    }`}
                    onClick={() => applyDiscount(step)}
                    disabled={isPending}
                    aria-pressed={minDiscount === step}
                  >
                    {discountLabel(step)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="category-sidebar__widget">
            <h3 className="category-sidebar__title">סינון לפי מחיר</h3>
            <form className="category-sidebar__price-form" onSubmit={applyPrice}>
              <div className="category-sidebar__price-row">
                <label className="sr-only" htmlFor="price-min">
                  מחיר מינימלי
                </label>
                <input
                  id="price-min"
                  className="category-sidebar__price-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="מ- ₪"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
                <label className="sr-only" htmlFor="price-max">
                  מחיר מקסימלי
                </label>
                <input
                  id="price-max"
                  className="category-sidebar__price-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="עד ₪"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
              </div>
              <button type="submit" className="category-sidebar__price-btn" disabled={isPending}>
                סינון
              </button>
            </form>
          </div>
        </div>
      </details>
    </aside>
  )
}
