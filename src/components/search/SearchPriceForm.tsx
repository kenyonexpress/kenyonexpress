'use client'

import { PRICE_ERRORS } from '@/components/category/CategoryFilterSidebar'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The price range inside the search filters disclosure (UX21).
 *
 * The archive sidebar's form, with the same two refusals (an inverted range,
 * a non-number) decided on the page before anything becomes a URL, writing
 * the engine's own names (`price_min` / `price_max`, whole shekels) instead
 * of the sidebar's `min` / `max`, and seeded from the URL so a range already
 * applied is shown back rather than two empty fields. Any change drops the
 * page.
 */
export default function SearchPriceForm({
  priceMin,
  priceMax,
}: {
  priceMin?: string
  priceMax?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [min, setMin] = useState(priceMin ?? '')
  const [max, setMax] = useState(priceMax ?? '')
  const [error, setError] = useState<string | null>(null)

  function apply(e: React.FormEvent) {
    e.preventDefault()
    const lo = min.trim() === '' ? null : Number(min)
    const hi = max.trim() === '' ? null : Number(max)
    const bad = (n: number | null) => n != null && !(Number.isFinite(n) && n >= 0)
    if (bad(lo) || bad(hi)) {
      setError(PRICE_ERRORS.shape)
      return
    }
    if (lo != null && hi != null && lo > hi) {
      setError(PRICE_ERRORS.order)
      return
    }
    setError(null)
    const params = new URLSearchParams(searchParams)
    if (lo != null) params.set('price_min', String(Math.floor(lo)))
    else params.delete('price_min')
    if (hi != null) params.set('price_max', String(Math.floor(hi)))
    else params.delete('price_max')
    params.delete('min')
    params.delete('max')
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <form
      className="category-sidebar__price-form search-filters__price"
      onSubmit={apply}
      noValidate
    >
      <h3 className="search-filters__price-title">סינון לפי מחיר</h3>
      <div className="category-sidebar__price-row">
        <label className="sr-only" htmlFor="search-price-min">
          מחיר מינימלי
        </label>
        <input
          id="search-price-min"
          className="category-sidebar__price-input"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="מ- ₪"
          value={min}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'search-price-error' : undefined}
          onChange={(e) => {
            setMin(e.target.value)
            setError(null)
          }}
        />
        <label className="sr-only" htmlFor="search-price-max">
          מחיר מקסימלי
        </label>
        <input
          id="search-price-max"
          className="category-sidebar__price-input"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="עד ₪"
          value={max}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'search-price-error' : undefined}
          onChange={(e) => {
            setMax(e.target.value)
            setError(null)
          }}
        />
      </div>
      {error && (
        <p id="search-price-error" className="category-sidebar__price-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="category-sidebar__price-btn" disabled={isPending}>
        סינון
      </button>
    </form>
  )
}
