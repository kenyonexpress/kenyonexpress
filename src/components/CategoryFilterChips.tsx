'use client'

import { parseCategoryFilterChips, toggleFilterChipHref } from '@/lib/category-filter-chips'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * F63: Category filter chips row.
 * Four chips: weekend/free shipping/price brackets, multi-select, URL-driven.
 * Mobile sticky at top.
 */
export default function CategoryFilterChips() {
  const pathname = usePathname()
  const params = useSearchParams()
  const filters = parseCategoryFilterChips(params)
  const source = new URLSearchParams(params)

  const items = [
    { key: 'weekend' as const, label: 'פתוח בסופ״ש', on: filters.weekend },
    { key: 'free_shipping' as const, label: 'משלוח חינם', on: filters.freeShipping },
    { key: 'price_100' as const, label: 'עד 100₪', on: filters.price100 },
    { key: 'price_500' as const, label: 'עד 500₪', on: filters.price500 },
  ]

  return (
    <nav aria-label="סינון קטגוריה" className="category-filter-chips">
      {items.map((item) => (
        <Link
          key={item.key}
          href={toggleFilterChipHref(pathname, source, item.key)}
          aria-current={item.on ? 'true' : undefined}
          className={`category-filter-chips__chip${item.on ? ' category-filter-chips__chip--on' : ''}`}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
