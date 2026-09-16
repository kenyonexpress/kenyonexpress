import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import SearchFacetNav from '@/components/search/SearchFacetNav'
import { getAllCategories, parseProductType } from '@/lib/category-page'
import { hasActiveFacets, toFacetSearchParams } from '@/lib/search/facet-links'
import { parseFacetedParams } from '@/lib/search/faceted'
import { type FacetHit, facetedSearchCached } from '@/lib/search/faceted-server'
import { recordRecentSearch, recordSearchTerm } from '@/lib/search/record'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import '@/styles/category-page.css'

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * THIS PAGE HAS NO SEARCH FIELD, AND THAT IS THE PRODUCT RULE, NOT AN OMISSION.
 *
 * KenyonExpress ships no search input anywhere: not in the masthead, not in the
 * handheld header, not in the off-canvas drawer, and not here. The Meilisearch
 * backend is untouched and this route still answers `?q=`, so a link from a
 * campaign, a sitemap or an internal redirect resolves to real results -- what
 * is gone is the box a visitor could type into.
 *
 * `src/components/layout/__tests__/no-search-ui.test.ts` fails the suite if a
 * text/search input, a search role or a search-shaped component comes back
 * anywhere in the shell.
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
 * ONE SEARCH, THREE CONSUMERS. The count, the grid and the facet navigation
 * each await `facetedSearchCached` with the page's own params; React's
 * request cache runs it once. The engine is the faceted one
 * (lib/search/faceted-server.ts, the same code behind /api/search/facets),
 * so a count in the navigation is exactly the count the grid shows after
 * the click, and the page and the API cannot disagree about a URL.
 */
async function ResultCount({ params }: { params: URLSearchParams }) {
  const outcome = await facetedSearchCached(params)
  const q = params.get('q') ?? ''
  const total = 'error' in outcome ? 0 : outcome.total
  const engine = 'error' in outcome ? null : outcome.engine

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
  // Recorded for the QUERY, not for the narrowed view: a shopper who typed
  // ספא and then clicked a city facet down to zero results has not told us
  // the catalogue lacks spas. Only the un-narrowed search is the signal the
  // admin's empty-results list exists to collect.
  const parsed = parseFacetedParams(params)
  if (!parsed.ok || !hasActiveFacets(parsed.params)) {
    await recordSearchTerm(q, total)
    await recordRecentSearch(await createClient(), q)
  }

  return (
    <p className="category-page__count">
      נמצאו {total} מוצרים
      {engine === 'meilisearch' && ' · Meilisearch'}
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

async function ResultGrid({ params }: { params: URLSearchParams }) {
  const outcome = await facetedSearchCached(params)
  const q = params.get('q') ?? ''
  const results = 'error' in outcome ? [] : outcome.results
  const parsed = parseFacetedParams(params)
  const narrowed = parsed.ok && hasActiveFacets(parsed.params)

  if (results.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים עבור "{q}".</p>
        <p>{narrowed ? 'נסו להסיר סינון או מילת חיפוש אחרת.' : 'נסו מילת חיפוש אחרת.'}</p>
      </div>
    )
  }

  return (
    <ul className="category-products">
      {results.map((hit) => (
        <li key={hit.id} className="category-products__item">
          <CategoryProductCard product={toCard(hit)} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The facet navigation, from the same search. Renders nothing for a query
 * too short to run and nothing when the engine found no facets at all, so
 * an empty catalogue does not draw an empty sidebar.
 */
async function ResultFacets({ params }: { params: URLSearchParams }) {
  const outcome = await facetedSearchCached(params)
  if ('error' in outcome) return null
  return <SearchFacetNav facets={outcome.facets} current={params} />
}

/**
 * TWO ROWS OF PLACEHOLDER CARDS, AND THE PAIR WITH `--search` BELOW IS THE FIX.
 *
 * `.category-page__body` is `display: block`, so the filter sidebar and the
 * footer sit BELOW the grid rather than beside it. Every card row the
 * placeholder reserves and the results do not fill drags both of them upward
 * when the boundary resolves, and a shift of something that becomes visible is
 * exactly what CLS counts.
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
 * So the placeholder is tall enough to keep the sidebar off screen, and
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
 */
const SEARCH_SKELETON_CARDS = 10

/**
 * The frame, minus the query.
 *
 * The H1, the search box's value, the count and the grid are all the query, and
 * the query is `searchParams`. What IS static is the page's structure: the
 * breadcrumb, the heading's line box, the search box at full width and the grid
 * skeleton. So the shell renders the search page and the query fills it in.
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
        <div className="category-page__body">
          <div className="category-page__main category-page__main--search">
            {/* ONE ROW, not three. See SEARCH_SKELETON_ROWS below. */}
            <CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />
          </div>
          <div className="category-sidebar" aria-hidden="true" />
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
  const productType = parseProductType(sp.type)
  // The engine's view of the URL: query, facets, sort, and the sidebar's
  // price bounds under the facet API's names.
  const params = toFacetSearchParams(sp)
  const canSearch = q.length >= MIN_QUERY

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
              <ResultCount params={params} />
            </Suspense>
          )}
        </header>

        <div className="category-page__body">
          <div className="category-page__main category-page__main--search">
            {!canSearch ? (
              <div className="category-page__empty">
                <p>הקלידו לפחות {MIN_QUERY} תווים כדי לחפש.</p>
              </div>
            ) : (
              <Suspense fallback={<CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />}>
                <ResultGrid params={params} />
              </Suspense>
            )}
          </div>

          {/* Below the grid, like the sidebar: `.category-page__body` is
              display: block, and the CLS note above explains why nothing may
              sit beside the grid. No fallback: the nav has no fixed height
              and streams in under the sidebar's border, off screen. */}
          {canSearch && (
            <Suspense fallback={null}>
              <ResultFacets params={params} />
            </Suspense>
          )}

          <CategoryFilterSidebar
            categories={allCategories}
            priceMin={undefined}
            priceMax={undefined}
            productType={productType}
          />
        </div>
      </div>
    </div>
  )
}
