'use client'

import Link from 'next/link'
import '@/styles/breadcrumbs.css'

export type BreadcrumbItem = {
  label: string
  href?: string
}

type Props = {
  items: BreadcrumbItem[]
  className?: string
  showEllipsis?: boolean
}

export default function Breadcrumbs({ items, className = '', showEllipsis = true }: Props) {
  const shouldTruncate = showEllipsis && items.length > 2

  return (
    <nav dir="rtl" className={`breadcrumbs ${className}`} aria-label="נתיב ניווט">
      <ol className="breadcrumbs__list">
        {items.map((item, index) => {
          // On mobile (< 768px), show only first and last items with ellipsis
          const isHidden = shouldTruncate && index > 0 && index < items.length - 1
          const isLastItem = index === items.length - 1
          const isFirstItem = index === 0

          return (
            <li
              key={`${item.label}-${index}`}
              className={`breadcrumbs__item ${isHidden ? 'breadcrumbs__item--hidden-mobile' : ''} ${isLastItem ? 'breadcrumbs__item--current' : ''}`}
              aria-current={isLastItem ? 'page' : undefined}
            >
              {item.href ? (
                <Link href={item.href} className="breadcrumbs__link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumbs__text">{item.label}</span>
              )}

              {/* Separator after item (not after last item) */}
              {!isLastItem && (
                <span className="breadcrumbs__sep" aria-hidden="true">
                  /
                </span>
              )}

              {/* Ellipsis: shown on mobile between first and last item when truncating */}
              {shouldTruncate && isFirstItem && (
                <span className="breadcrumbs__ellipsis" aria-hidden="true">
                  …
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
