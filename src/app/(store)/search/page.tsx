import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import SearchBox from '@/components/search/SearchBox'
import { type ProductTypeFilter, getAllCategories, parseProductType } from '@/lib/category-page'
import { searchProductsCached } from '@/lib/search-server'
import { recordRecentSearch, recordSearchTerm } from '@/lib/search/record'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import '@/styles/category-page.css'

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

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

/** Count and grid share one search call via searchProductsCached. */
async function ResultCount({ q, productType }: { q: string; productType?: ProductTypeFilter }) {
  const { total, engine } = await searchProductsCached(q, 48, productType)

  // Recorded HERE, on the results page, and never in the type-ahead route: the
  // suggest endpoint fires on every keystroke, so recording there would fill
  // the table with "מ", "מס", "מסע" and bury the real query under its own
  // prefixes. This component already holds the total, which is the half of the
  // record that matters - a query with zero results is a customer telling us,
  // in their own words, what we do not sell.
  //
  // Awaited rather than fired and forgotten: a serverless invocation can be
  // frozen the moment its response is returned. Neither call can throw.
  await recordSearchTerm(q, total)
  await recordRecentSearch(await createClient(), q)

  return (
    <p className="category-page__count">
      נמצאו {total} מוצרים
      {engine === 'meilisearch' && ' · Meilisearch'}
    </p>
  )
}

async function ResultGrid({ q, productType }: { q: string; productType?: ProductTypeFilter }) {
  const { results } = await searchProductsCached(q, 48, productType)

  if (results.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים עבור "{q}".</p>
        <p>נסו מילת חיפוש אחרת.</p>
      </div>
    )
  }

  return (
    <ul className="category-products">
      {results.map((product) => (
        <li key={product.id} className="category-products__item">
          <CategoryProductCard
            product={
              {
                ...product,
                categories: product.category ? [product.category] : [],
              } as unknown as CategoryProduct
            }
          />
        </li>
      ))}
    </ul>
  )
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
        <div className="category-search__box">
          <SearchBox defaultValue="" />
        </div>
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
          {q.length >= MIN_QUERY && (
            <Suspense
              fallback={
                <div className="category-page__count category-page__count--pending" aria-hidden />
              }
            >
              <ResultCount q={q} productType={productType} />
            </Suspense>
          )}
        </header>

        <div className="category-search__box">
          <SearchBox defaultValue={q} />
        </div>

        <div className="category-page__body">
          <div className="category-page__main category-page__main--search">
            {q.length < MIN_QUERY ? (
              <div className="category-page__empty">
                <p>הקלידו לפחות {MIN_QUERY} תווים כדי לחפש.</p>
              </div>
            ) : (
              <Suspense fallback={<CategoryGridSkeleton count={SEARCH_SKELETON_CARDS} />}>
                <ResultGrid q={q} productType={productType} />
              </Suspense>
            )}
          </div>

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
