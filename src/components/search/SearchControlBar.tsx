'use client'

import { ViewSwitcher } from '@/components/category/CategoryControlBar'
import {
  SEARCH_FILTERS_ID,
  SEARCH_SORT_OPTIONS,
  type SearchSortValue,
} from '@/lib/search/results-page'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

/**
 * The results page's control bar (UX21): the archive bar's anatomy
 * (`category-control-bar`, measured off live) with the search's own sort.
 *
 * MEASURED BEFORE (logs/ux21/before.json): the engine accepted `sort=` and
 * nothing on the page set it, so the only order a shopper could get was
 * relevance; the filters sat 2011px down a 380 page with no control in the
 * first screen pointing at them. Now the bar carries the four orders the
 * engine can produce (relevance is the default and no parameter), a phone
 * link that opens the filters disclosure and scrolls to it, and the same
 * grid / list switcher the archives have, so a preference set on /products
 * holds here.
 *
 * A sort change is a navigation (`router.push`, scroll kept), with the page
 * dropped: page three of the old order means nothing in the new one.
 */
export default function SearchControlBar({
  sort,
  activeFilterCount = 0,
}: {
  sort: SearchSortValue
  /** How many chips narrow the search; shown on the phone's filters link. */
  activeFilterCount?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleSort(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    const params = new URLSearchParams(searchParams)
    if (value === 'relevance') params.delete('sort')
    else params.set('sort', value)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  /**
   * The anchor still navigates to `#search-filters`; what it adds is opening
   * the disclosure first, because a jump to a closed `<details>` lands on one
   * row and the shopper has to find the second press themselves.
   */
  function openFilters() {
    const details = document.getElementById(SEARCH_FILTERS_ID)
    if (details instanceof HTMLDetailsElement) details.open = true
  }

  return (
    <div className="category-control-bar search-control-bar" aria-busy={isPending || undefined}>
      <a
        className="category-control-bar__filters"
        href={`#${SEARCH_FILTERS_ID}`}
        onClick={openFilters}
      >
        <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true" fill="currentColor">
          <path d="M2 5h9a2.5 2.5 0 0 0 4.9 0H18v2h-2.1a2.5 2.5 0 0 0-4.9 0H2V5Zm0 8h4.1a2.5 2.5 0 0 1 4.9 0h7v2h-7a2.5 2.5 0 0 1-4.9 0H2v-2Z" />
        </svg>
        סינון
        {activeFilterCount > 0 && (
          <>
            <span className="sr-only"> סינונים פעילים: </span>
            <span className="category-control-bar__filters-count">{activeFilterCount}</span>
          </>
        )}
      </a>
      <ViewSwitcher />
      <div className="category-control-bar__sort">
        <label className="sr-only" htmlFor="search-orderby">
          מיון תוצאות החיפוש
        </label>
        <select
          id="search-orderby"
          name="sort"
          className="category-control-bar__select"
          value={sort}
          onChange={handleSort}
          disabled={isPending}
          aria-label="מיון תוצאות החיפוש"
        >
          {SEARCH_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
