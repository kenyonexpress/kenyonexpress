import { activeSearchChips, clearSearchFiltersHref } from '@/lib/search/results-page'
import Link from 'next/link'

/**
 * The strip of active filters between the control bar and the grid (UX21).
 *
 * MEASURED BEFORE (logs/ux21/before.json): on `/search?q=זוג&city=חיפה` the
 * only sign the search was narrowed sat INSIDE the facet navigation, below
 * the grid: at 380 the chips were at y=1220 under an empty state at y=429, so
 * the first screen said "no results for זוג" and nothing said why. Now each
 * chip is a link that removes its own facet, the price range is a chip too
 * (the facet nav never had one), and the last link removes all of them.
 *
 * Renders nothing on an unfiltered search, so the bar-to-grid gap the archive
 * pages keep stays zero here as well. A server component: pure links from the
 * URL, the same `lib/search/results-page.ts` the pagination reads.
 */
export default function SearchActiveFilters({ current }: { current: URLSearchParams }) {
  const chips = activeSearchChips(current)
  if (chips.length === 0) return null

  return (
    <nav
      className="category-active-filters search-active-filters"
      aria-label="סינונים פעילים"
      data-active-filters
    >
      <span className="category-active-filters__label">מסונן לפי:</span>
      <ul className="category-active-filters__list">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              className="category-active-filters__chip"
              aria-label={`הסרת הסינון ${chip.label}: ${chip.valueLabel}`}
            >
              {chip.label}: {chip.valueLabel}
              <span aria-hidden="true"> ×</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={clearSearchFiltersHref(current)} className="category-active-filters__clear">
        נקו הכל
      </Link>
    </nav>
  )
}
