import { type ArchiveLinkParams, activeFilterChips, clearFiltersHref } from '@/lib/category-filters'
import Link from 'next/link'

/**
 * The strip of active filters between the control bar and the grid (UX14).
 *
 * Before this existed the only sign that an archive was narrowed sat inside a
 * CLOSED `<details>` under the grid: `?type=coupon&min=50` rendered three cards
 * under a heading that said "חנות" and nothing on the first screen said why
 * the other 43 were missing. Each chip here is a link that removes its own
 * facet, and the last link removes all of them.
 *
 * Renders nothing on an unfiltered page, so the default archive keeps the
 * zero gap between the bar and the first card that the parity gate measured.
 * A server component: the links are built from the same `linkParams` the
 * pagination uses, by `lib/category-filters.ts`.
 */
export default function CategoryActiveFilters({
  pathname,
  params,
}: {
  pathname: string
  params: ArchiveLinkParams
}) {
  const chips = activeFilterChips(pathname, params)
  if (chips.length === 0) return null

  return (
    <nav className="category-active-filters" aria-label="סינונים פעילים" data-active-filters>
      <span className="category-active-filters__label">מסונן לפי:</span>
      <ul className="category-active-filters__list">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              className="category-active-filters__chip"
              aria-label={`הסרת הסינון ${chip.label}: ${chip.value}`}
            >
              {chip.label}: {chip.value}
              <span aria-hidden="true"> ×</span>
            </Link>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <Link href={clearFiltersHref(pathname, params)} className="category-active-filters__clear">
          נקה הכל
        </Link>
      )}
    </nav>
  )
}
