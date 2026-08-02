'use client'

import {
  CATEGORY_TOKENS,
  ORDERBY_TO_SORT,
  SORT_TO_ORDERBY,
  type SortValue,
} from '@/lib/category-tokens'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export type { SortValue }

/* Live control bar (measured): grid/list view switcher on the inline-start
   side, orderby select on the inline-end side. Switcher is visual only. */
function ViewSwitcher() {
  const icons = [
    'M1 1h3v3H1zM5 1h3v3H5zM9 1h3v3H9zM13 1h3v3h-3zM1 5h3v3H1zM5 5h3v3H5zM9 5h3v3H9zM13 5h3v3h-3zM1 9h3v3H1zM5 9h3v3H5zM9 9h3v3H9zM13 9h3v3h-3zM1 13h3v3H1zM5 13h3v3H5zM9 13h3v3H9zM13 13h3v3h-3z',
    'M1 1h4v4H1zM6 1h4v4H6zM11 1h4v4h-4zM1 6h4v4H1zM6 6h4v4H6zM11 6h4v4h-4zM1 11h4v4H1zM6 11h4v4H6zM11 11h4v4h-4z',
    'M1 2h3v3H1zM5 3h11v1H5zM1 7h3v3H1zM5 8h11v1H5zM1 12h3v3H1zM5 13h11v1H5z',
    'M1 1h5v5H1zM7 2h9v1H7zM7 4h9v1H7zM1 10h5v5H1zM7 11h9v1H7zM7 13h9v1H7z',
  ]
  return (
    <div className="category-view-switcher" aria-hidden="true">
      {icons.map((d, i) => (
        <span
          key={d.slice(0, 8)}
          className={`category-view-switcher__btn${i === 0 ? ' is-active' : ''}`}
        >
          <svg viewBox="0 0 17 17" width={16} height={16} fill="currentColor" aria-hidden="true">
            <path d={d} />
          </svg>
        </span>
      ))}
    </div>
  )
}

export default function CategoryControlBar({ value }: { value: SortValue }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const orderbyValue = SORT_TO_ORDERBY[value] ?? 'menu_order'

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orderby = e.target.value
    const sort = ORDERBY_TO_SORT[orderby] ?? 'menu_order'
    const params = new URLSearchParams(searchParams)
    if (sort === 'menu_order') params.delete('sort')
    else params.set('sort', sort)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <div className="category-control-bar">
      <ViewSwitcher />
      <div className="category-control-bar__sort">
        <label className="sr-only" htmlFor="category-orderby">
          מיון מוצרים
        </label>
        <select
          id="category-orderby"
          name="orderby"
          className="category-control-bar__select"
          value={orderbyValue}
          onChange={handleChange}
          disabled={isPending}
          aria-label="מיון מוצרים"
        >
          {CATEGORY_TOKENS.sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
