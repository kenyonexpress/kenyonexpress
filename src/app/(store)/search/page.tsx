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
        <header className="category-page__header">
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
          <div className="category-page__main">
            <CategoryGridSkeleton count={12} />
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

        <header className="category-page__header">
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
          <div className="category-page__main">
            {q.length < MIN_QUERY ? (
              <div className="category-page__empty">
                <p>הקלידו לפחות {MIN_QUERY} תווים כדי לחפש.</p>
              </div>
            ) : (
              <Suspense fallback={<CategoryGridSkeleton count={12} />}>
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
