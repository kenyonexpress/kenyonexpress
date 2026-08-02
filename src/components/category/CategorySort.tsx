'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export const SORT_OPTIONS = [
  { value: 'newest', label: 'החדשים ביותר' },
  { value: 'price_asc', label: 'מחיר: מהנמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: מהגבוה לנמוך' },
  { value: 'name', label: 'לפי שם' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']

export default function CategorySort({ value }: { value: SortValue }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams)
    if (e.target.value === 'newest') {
      params.delete('sort')
    } else {
      params.set('sort', e.target.value)
    }
    params.delete('page') // a new sort starts from the first page
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <span className="whitespace-nowrap">מיון:</span>
      <select
        value={value}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-start text-sm text-gray-800 outline-none transition-colors hover:border-gray-300 focus:border-brand-primary disabled:opacity-60"
        aria-label="מיון מוצרים"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
