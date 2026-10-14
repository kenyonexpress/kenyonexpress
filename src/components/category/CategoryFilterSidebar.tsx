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
  /**
   * How many facets narrow the page (UX14), from `activeFilterCount`. Shown
   * on the closed summary, because the panel is closed and below the grid and
   * nothing else on it said that a filter was already applied.
   */
  activeCount?: number
}

/** The price form's two refusals, in the shopper's words. */
export const PRICE_ERRORS = {
  order: 'המחיר המינימלי גבוה מהמקסימלי',
  shape: 'נא להזין מחירים כמספרים חיוביים',
} as const

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
  activeCount = 0,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [min, setMin] = useState(priceMin != null ? String(priceMin) : '')
  const [max, setMax] = useState(priceMax != null ? String(priceMax) : '')
  const [priceError, setPriceError] = useState<string | null>(null)
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

  /**
   * The price range is checked HERE before it becomes a URL (UX14). Before,
   * `min=200&max=50` was sent as typed and came back as an empty grid that
   * blamed "your selection", and a negative number was silently dropped. Now
   * an inverted range or a non-number stops on the page with a Hebrew
   * sentence in a live region and nothing is requested; a blank field is
   * "no bound", as it always was.
   */
  function applyPrice(e: React.FormEvent) {
    e.preventDefault()
    const lo = min.trim() === '' ? null : Number(min)
    const hi = max.trim() === '' ? null : Number(max)
    const bad = (n: number | null) => n != null && !(Number.isFinite(n) && n >= 0)
    if (bad(lo) || bad(hi)) {
      setPriceError(PRICE_ERRORS.shape)
      return
    }
    if (lo != null && hi != null && lo > hi) {
      setPriceError(PRICE_ERRORS.order)
      return
    }
    setPriceError(null)
    pushWith((params) => {
      if (lo != null) params.set('min', min.trim())
      else params.delete('min')
      if (hi != null) params.set('max', max.trim())
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
        <summary className="category-sidebar__summary">
          סינון מוצרים
          {activeCount > 0 && (
            <>
              <span className="sr-only"> סינונים פעילים: </span>
              <span className="category-sidebar__summary-count"> ({activeCount})</span>
            </>
          )}
        </summary>
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
            <form className="category-sidebar__price-form" onSubmit={applyPrice} noValidate>
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
                  aria-invalid={priceError ? true : undefined}
                  aria-describedby={priceError ? 'price-error' : undefined}
                  onChange={(e) => {
                    setMin(e.target.value)
                    setPriceError(null)
                  }}
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
                  aria-invalid={priceError ? true : undefined}
                  aria-describedby={priceError ? 'price-error' : undefined}
                  onChange={(e) => {
                    setMax(e.target.value)
                    setPriceError(null)
                  }}
                />
              </div>
              {priceError && (
                <p id="price-error" className="category-sidebar__price-error" role="alert">
                  {priceError}
                </p>
              )}
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
