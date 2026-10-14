import SearchFacetNav from '@/components/search/SearchFacetNav'
import SearchPriceForm from '@/components/search/SearchPriceForm'
import { buildFacetSections } from '@/lib/search/facet-links'
import { facetedSearchCached } from '@/lib/search/faceted-server'
import { SEARCH_FILTERS_ID } from '@/lib/search/results-page'
import { Suspense } from 'react'

/**
 * The filters, in the first screen (UX21).
 *
 * MEASURED BEFORE (logs/ux21/before.json): the facet navigation was rendered
 * below the grid, above the archive sidebar, with no fallback: at 380 it sat
 * at y=2011 on a 2972px page, at 1440 at y=1090 against a 900px viewport.
 * Nothing in the first screen said the results could be narrowed, and the
 * sidebar that sat under it carried a `type` list of two values and a price
 * form that ignored the URL (`priceMin={undefined}`), so the same page
 * offered the same facet twice and a price range that forgot itself.
 *
 * Now ONE closed `<details>` directly under the control bar: a single 44px
 * row that names how many filters are on, opening to the facet links with
 * their counts (the same search that produced the grid, so a count is the
 * count the grid shows after the click) and the price range. Closed by
 * default for the reason the archive sidebar is: a filter panel open above
 * the grid pushes every row down, and the chips strip already says what is
 * applied. The facet links stream in INSIDE the closed disclosure, so the
 * row is the same height before and after the engine answers and the page
 * does not shift (the CLS notes in page.tsx are why this matters here).
 *
 * The archive's sidebar is gone from this page: the facets cover its type
 * and category lists with counts, and the price form moved in here.
 */
export default function SearchFilters({
  params,
  activeCount,
}: {
  params: URLSearchParams
  activeCount: number
}) {
  return (
    <details id={SEARCH_FILTERS_ID} className="search-filters">
      <summary className="search-filters__summary">
        סינון תוצאות
        {activeCount > 0 && (
          <span className="search-filters__count">
            <span className="sr-only"> סינונים פעילים: </span>({activeCount})
          </span>
        )}
      </summary>
      <div className="search-filters__body">
        <Suspense fallback={<p className="search-filters__loading">טוען סינונים...</p>}>
          <SearchFacetBody params={params} />
        </Suspense>
        <SearchPriceForm
          priceMin={params.get('price_min') ?? undefined}
          priceMax={params.get('price_max') ?? undefined}
        />
      </div>
    </details>
  )
}

/**
 * The facet links, from the page's own search. Says so when there is nothing
 * to narrow by rather than rendering an empty box: a shopper who opened the
 * panel asked a question.
 */
async function SearchFacetBody({ params }: { params: URLSearchParams }) {
  const outcome = await facetedSearchCached(params)
  if ('error' in outcome) {
    return <p className="search-filters__none">הסינונים אינם זמינים כרגע.</p>
  }
  const sections = buildFacetSections(outcome.facets, params)
  if (sections.length === 0) {
    return <p className="search-filters__none">אין סינונים נוספים לחיפוש הזה.</p>
  }
  return <SearchFacetNav facets={outcome.facets} current={params} />
}
