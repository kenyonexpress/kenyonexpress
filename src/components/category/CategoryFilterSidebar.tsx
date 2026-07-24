'use client'

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
}

const TYPE_OPTIONS = [
  { value: undefined, label: 'הכל' },
  { value: 'coupon' as const, label: 'קופונים' },
  { value: 'physical' as const, label: 'מוצרים פיזיים' },
]

export default function CategoryFilterSidebar({
  categories,
  currentSlug,
  priceMin,
  priceMax,
  productType,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [min, setMin] = useState(priceMin != null ? String(priceMin) : '')
  const [max, setMax] = useState(priceMax != null ? String(priceMax) : '')

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

  return (
    <aside className="category-sidebar" aria-label="סינון מוצרים">
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
    </aside>
  )
}
