import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import SearchBox from '@/components/search/SearchBox'
import { type ProductTypeFilter, parseProductType } from '@/lib/category-page'
import { searchProductsCached } from '@/lib/search-server'
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
  const { total } = await searchProductsCached(q, 48, productType)
  return <p className="category-page__count">נמצאו {total} מוצרים</p>
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

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const q = firstStr(sp.q).trim()
  const productType = parseProductType(sp.type)

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: 'חיפוש' }]} />

        <header className="category-page__header">
          <h1 className="category-page__title">
            {q ? `תוצאות חיפוש עבור "${q}"` : 'חיפוש מוצרים'}
          </h1>
          {q.length >= MIN_QUERY && (
            <Suspense fallback={null}>
              <ResultCount q={q} productType={productType} />
            </Suspense>
          )}
        </header>

        <div className="category-search__box">
          <SearchBox defaultValue={q} />
        </div>

        {/* Live WP search has no filter chrome; keep the grid full-width. */}
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
        </div>
      </div>
    </div>
  )
}
