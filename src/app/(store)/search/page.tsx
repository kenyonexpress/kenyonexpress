import { CatalogViewBody, CatalogViewProvider } from '@/components/category/CatalogViewProvider'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import { ABOVE_FOLD_CARD_COUNT } from '@/components/category/above-fold'
import SaveSearch from '@/components/search/SaveSearch'
import SearchActiveFilters from '@/components/search/SearchActiveFilters'
import SearchControlBar from '@/components/search/SearchControlBar'
import SearchEmptyState from '@/components/search/SearchEmptyState'
import SearchFilters from '@/components/search/SearchFilters'
import SiteSearch from '@/components/search/SiteSearch'
import { getAllCategories } from '@/lib/category-page'
import { blurEntryFor, firstImageOf } from '@/lib/images/blur'
import { verifyEmptySearch } from '@/lib/search/empty-state-server'
import { hasActiveFacets, toFacetSearchParams } from '@/lib/search/facet-links'
import { parseFacetedParams } from '@/lib/search/faceted'
import { type FacetHit, facetedSearchCached } from '@/lib/search/faceted-server'
import { parseSearchPage, totalSearchPages } from '@/lib/search/paging'
import { recordRecentSearch, recordSearchTerm } from '@/lib/search/record'
import {
  activeSearchFilterCount,
  parseSearchSort,
  searchCountText,
  searchLinkParams,
} from '@/lib/search/results-page'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import '@/styles/category-page.css'

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * THE RESULTS PAGE, WITH ITS CONTROLS IN THE FIRST SCREEN (UX21).
 *
 * From 04.09 to 30.09 this page answered `?q=` and carried no input, by the
 * rule that put no search UI anywhere. STEP 08 (30.09) brought the field back:
 * the same `SiteSearch` combobox the masthead mounts, seeded with the query.
 * The engine did not change: `facetedSearchCached` is Meilisearch first (typo
 * budget 4/7, Hebrew tokenizer, prefix synonyms), then Postgres.
 *
 * UX21 (14.10), measured before in logs/ux21/before.json: the engine took a
 * sort nothing on the page set; the facet navigation sat below the grid, off
 * screen at every width (y=2011 at 380); a narrowed search that found nothing
 * showed its chips 800px under the empty state and offered no way to drop the
 * filter; 48 hits had no page two; and the count line printed the engine's
 * name to the shopper. Now the page has the archive's anatomy: a control bar
 * (sort, phone filters link, grid / list switcher), the active-filter strip,
 * a closed filters disclosure that opens to the facets and the price range,
 * the grid, the archive's pagination, and an empty state whose doors are
 * verified against the engine before they are offered. The engine's name is
 * a `data-engine` attribute on the count, for probes, not for people.
 *
 * `src/components/layout/search-ui.test.ts` pins the field's shape (one
 * component, three mounts, fixed ids, combobox wiring) and that this page keeps
 * answering through `facetedSearchCached`.
 */
const MIN_QUERY = 2

function firstStr(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = firstStr((await searchParams).q).trim()
  return {
    title: q ? `תוצאות חיפוש: ${q}` : 'חיפוש מוצרים',
    description: q ? `תוצאות חיפוש עבור "${q}" בקניון אקספרס` : 'חיפוש מוצרים בקניון אקספרס',
    // A results page is thin content that should never be indexed.
    robots: { index: false },
  }
}

/**
 * ONE SEARCH, THREE CONSUMERS. The count, the grid and the filters disclosure
 * each await `facetedSearchCached` with the page's own params; React's
 * request cache runs it once. The engine is the faceted one
 * (lib/search/faceted-server.ts, the same code behind /api/search/facets),
 * so a count in the navigation is exactly the count the grid shows after
 * the click, and the page and the API cannot disagree about a URL.
 */
async function ResultCount({ params, page }: { params: URLSearchParams; page: number }) {
  const outcome = await facetedSearchCached(params)
  const q = params.get('q') ?? ''
  const total = 'error' in outcome ? 0 : outcome.total
  const shown = 'error' in outcome ? 0 : outcome.results.length
  const engine = 'error' in outcome ? 'error' : outcome.engine

  // Recorded HERE, on the results page, and never in the type-ahead route: the
  // suggest endpoint fires on every keystroke, so recording there would fill
  // the table with "מ", "מס", "מסע" and bury the real query under its own
  // prefixes. This component already holds the total, which is the half of the
  // record that matters - a query with zero results is a customer telling us,
  // in their own words, what we do not sell.
  //
  // Awaited rather than fired and forgotten: a serverless invocation can be
  // frozen the moment its response is returned. Neither call can throw.
  //
  // Recorded for the QUERY, not for the narrowed view, and not again for page
  // two: a shopper who typed ספא and then clicked a city facet down to zero
  // results has not told us the catalogue lacks spas. Only the un-narrowed
  // first page is the signal the admin's empty-results list exists to collect.
  const parsed = parseFacetedParams(params)
  if (page === 1 && (!parsed.ok || !hasActiveFacets(parsed.params))) {
    await recordSearchTerm(q, total)
    await recordRecentSearch(await createClient(), q)
  }

  return (
    <p className="category-page__count" data-engine={engine}>
      {searchCountText(total, page, shown)}
    </p>
  )
}

/** A hit as the listing card wants it. The card owns the gallery shape. */
function toCard(hit: FacetHit): CategoryProduct {
  return {
    id: hit.id,
    slug: hit.slug,
    name_he: hit.name_he,
    kenyon_price: hit.kenyon_price,
    full_price: hit.full_price,
    images: hit.images,
    stock_quantity: hit.stock_quantity,
    categories:
      hit.category && hit.category_slug ? [{ name_he: hit.category, slug: hit.category_slug }] : [],
  }
}

async function ResultGrid({
  params,
  page,
  categories,
}: {
  params: URLSearchParams
  page: number
  categories: { slug: string; name_he: string }[]
}) {
  const outcome = await facetedSearchCached(params)
  const q = params.get('q') ?? ''
  const results = 'error' in outcome ? [] : outcome.results
  const total = 'error' in outcome ? 0 : outcome.total
  const parsed = parseFacetedParams(params)
  const narrowed = parsed.ok && hasActiveFacets(parsed.params)
  const totalPages = totalSearchPages(total)
  const linkParams = searchLinkParams(params)

  if (results.length === 0) {
    // Not a dead end: the bare query when narrowed, a relaxed query, the
    // promoted terms and the categories. The first two are asked of the
    // engine first (lib/search/empty-state-server.ts), so a door opens onto
    // results and never onto a second empty page.
    const verification = await verifyEmptySearch({ q, params, narrowed })
    return (
      <>
        <SearchEmptyState
          query={q}
          narrowed={narrowed}
          minQuery={MIN_QUERY}
          categories={categories}
          verification={verification}
        />
        {/* A page past the end still shows the way back. */}
        {total > 0 && (
          <Pagination
            pathname="/search"
            params={linkParams}
            currentPage={page}
            totalPages={totalPages}
          />
        )}
      </>
    )
  }

  return (
    <>
      <ul className="category-products">
        {results.map((hit, index) => {
          // Same contract as the category page: see ABOVE_FOLD_CARD_COUNT.
          const asset = blurEntryFor(firstImageOf(hit.images))
          return (
            <li key={hit.id} className="category-products__item">
              <CategoryProductCard
                product={toCard(hit)}
                priority={index === 0}
                eager={index < ABOVE_FOLD_CARD_COUNT}
                blurDataURL={asset?.blur}
                dimensions={asset ? { w: asset.w, h: asset.h } : undefined}
              />
            </li>
          )
        })}
      </ul>
      {/* The archive's own pagination (UX14 shape): every filter and the sort
          survive in every page link, page one is the bare URL. Null on a
          single page, so a short result set keeps the grid's bottom edge. */}
      <Pagination
        pathname="/search"
        params={linkParams}
        currentPage={page}
        totalPages={totalPages}
      />
      {totalPages > 1 && (
        <p className="category-page__count category-page__count--bottom">
          {searchCountText(total, page, results.length)}
        </p>
      )}
    </>
  )
}

/**
 * TWO ROWS OF PLACEHOLDER CARDS, AND THE PAIR WITH `--search` BELOW IS THE FIX.
 *
 * `.category-page__body` is `display: block`, so the footer sits BELOW the
 * grid rather than beside it. Every card row the placeholder reserves and the
 * results do not fill drags it upward when the boundary resolves, and a shift
 * of something that becomes visible is exactly what CLS counts.
 *
 * Measured with raw `layout-shift` entries rather than Lighthouse's single
 * number, two runs per query, against the built page. The card is 234px wide in
 * a 1170px grid, so a row is five cards and 371px.
 *
 *   query      results   count=12   count=10   count=5   10 + reserved rows
 *   barbecue         0      0.263      0.164     0.059   0.001 - 0.004
 *   צימר             2      0.089      0.045     0.002   0.001
 *   קופון           15      0.000      0.001     0.083   0.001
 *   מוצר            16      0.000      0.001     0.127   0.001
 *
 * Two things in that table are worth keeping, because both contradict the
 * obvious guess:
 *
 * A SHORTER PLACEHOLDER IS NOT SAFER. At one row the sidebar lands at about
 * 900px, the viewport's own edge, so a grid that grows past it pushes the
 * sidebar ACROSS that edge and the growth is charged - 0.083 and 0.127, worse
 * than the three-row placeholder scores on the same queries.
 *
 * GROWTH IS ONLY FREE WHEN WHAT MOVES IS ALREADY OFF SCREEN. At two rows the
 * sidebar starts around 1270px, and the same growth costs 0.001.
 *
 * So the placeholder is tall enough to keep what follows off screen, and
 * `.category-page__main--search` holds that height afterwards so a search that
 * returns little cannot collapse back. Left at 12 on /category and /products
 * deliberately: their grids fill (13 and 61 here) and already measure 0.000.
 *
 * TWO MORE THINGS WERE NEEDED, AND NEITHER WAS THE GRID. Ten cards is two rows
 * at 1440 and FIVE on a phone, and the search H1 is the query so it wraps there
 * while its placeholder did not. Both are in category-page.css next to this
 * page's rules. Final, this build:
 *
 *              desktop   Pixel 5
 *   barbecue    0.0033    0.0394
 *   צימר        0.0007    0.0000
 *   מוצר        0.0007    0.0000
 *
 * UX21 moved the filters ABOVE the grid as a closed disclosure whose height
 * does not depend on the engine (the facet links stream in inside it), and
 * the shell below reserves the bar's box and the disclosure's row, so the
 * same reasoning holds: nothing that becomes visible changes height.
 */
const SEARCH_SKELETON_CARDS = 10

/**
 * The frame, minus the query.
 *
 * The H1, the search box's value, the count and the grid are all the query, and
 * the query is `searchParams`. What IS static is the page's structure: the
 * breadcrumb, the heading's line box, the search box at full width, the control
 * bar's box, the filters row and the grid skeleton. So the shell renders the
 * search page and the query fills it in.
 */
function SearchPageFallback() {
  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: 'חיפוש' }]} />
        <header className="category-page__header category-page__header--search">
          {/* A div rather than an empty <h1>: see the note on the same line in
              category/[slug]/page.tsx. The heading here is the query. */}
          <div className="category-page__title category-page__title--pending" aria-hidden="true" />
          {/* The count's box too, so the shell is the same height as the page
              that replaces it. */}
          <div className="category-page__count category-page__count--pending" aria-hidden="true" />
        </header>
        {/* The bar's box, not the bar: `SearchControlBar` reads the request.
            Same class, so the same measured height. Then the filters row. */}
        <div className="category-control-bar" aria-hidden="true" />
        <div className="search-filters search-filters--pending" aria-hidden="true" />
        <div className="category-page__body">
          <div className="category-page__main category-page__main--search">
            {/* ONE ROW, not three. See SEARCH_SKELETON_ROWS below. */}
            <CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage(props: Props) {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageBody {...props} />
    </Suspense>
  )
}

async function SearchPageBody({ searchParams }: Props) {
  const sp = await searchParams
  const q = firstStr(sp.q).trim()
  // The engine's view of the URL: query, facets, sort, the price bounds under
  // the facet API's names, and the page as the engine's offset.
  const params = toFacetSearchParams(sp)
  const page = parseSearchPage(sp.page)
  const sort = parseSearchSort(sp.sort)
  const canSearch = q.length >= MIN_QUERY
  const activeCount = activeSearchFilterCount(params)

  // Shell only. The search itself streams in behind the boundaries below.
  const allCategories = await getAllCategories()

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: 'חיפוש' }]} />

        <header className="category-page__header category-page__header--search">
          <h1 className="category-page__title">
            {q ? `תוצאות חיפוש עבור "${q}"` : 'חיפוש מוצרים'}
          </h1>
          {/* The page's own field, seeded with the query. Same component as
              the masthead, so the dropdown here and there cannot disagree. */}
          <div className="search-page__field">
            <SiteSearch id="page-search" variant="page" initialQuery={q} />
          </div>
          {/* The fallback is not `null`. A null fallback means the count's line
              box does not exist until it streams in, and inserting it into the
              header then pushes the entire page down - measured on
              /search?q=barbecue as two shifts, both attributed to the footer,
              CLS 0.401. The placeholder is the same box, held open. */}
          {canSearch && (
            <Suspense
              fallback={
                <div className="category-page__count category-page__count--pending" aria-hidden />
              }
            >
              <ResultCount params={params} page={page} />
            </Suspense>
          )}
          {/* The bookmark (STEP 08). Its own boundary with a same-height
              fallback: the session read must not hold the count back, and a
              44px row that appears late would push the grid down. */}
          {canSearch && (
            <Suspense fallback={<div className="search-save__wrap" aria-hidden />}>
              <SaveSearch params={params} />
            </Suspense>
          )}
        </header>

        {canSearch ? (
          // The grid / list preference (UX14): one client context around the
          // bar that sets it, the body that carries it as `data-view` and the
          // cards that read it. The fallback shell above keeps its plain divs.
          <CatalogViewProvider>
            <SearchControlBar sort={sort} activeFilterCount={activeCount} />

            {/* Null on an unfiltered search, so the bar-to-filters gap stays
                what the shell reserved. */}
            <SearchActiveFilters current={params} />

            {/* One closed row; the facets stream in inside it. */}
            <SearchFilters params={params} activeCount={activeCount} />

            <CatalogViewBody>
              <div className="category-page__main category-page__main--search">
                <Suspense fallback={<CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />}>
                  <ResultGrid params={params} page={page} categories={allCategories} />
                </Suspense>
              </div>
            </CatalogViewBody>
          </CatalogViewProvider>
        ) : (
          <div className="category-page__body">
            <div className="category-page__main category-page__main--search">
              <Suspense fallback={<CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />}>
                <SearchEmptyState
                  query={q}
                  narrowed={false}
                  tooShort
                  minQuery={MIN_QUERY}
                  categories={allCategories}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
