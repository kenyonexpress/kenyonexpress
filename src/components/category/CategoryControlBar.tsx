'use client'

import { CATEGORY_TOKENS, ORDERBY_TO_SORT, SORT_TO_ORDERBY } from '@/lib/category-tokens'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export type SortValue =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'name'
  | 'menu_order'
  | 'popularity'
  | 'rating'

const VALID_SORTS = new Set<string>([
  'newest',
  'price_asc',
  'price_desc',
  'name',
  'menu_order',
  'popularity',
  'rating',
])

export function parseSort(raw: string | string[] | undefined): SortValue {
  if (typeof raw === 'string' && VALID_SORTS.has(raw)) return raw as SortValue
  return 'menu_order'
}

type Props = {
  value: SortValue
  total: number
}

export default function CategoryControlBar({ value, total }: Props) {
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
      <p className="category-control-bar__count">
        {CATEGORY_TOKENS.controlBar.resultCountTemplate(total)}
      </p>
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
