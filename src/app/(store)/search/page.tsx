import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import SearchBox from '@/components/search/SearchBox'
import { getAllCategories, parseProductType } from '@/lib/category-page'
import { searchProductsServer } from '@/lib/search-server'
import type { Metadata } from 'next'
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

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const q = firstStr(sp.q).trim()
  const productType = parseProductType(sp.type)

  const [allCategories, { results, total, engine }] = await Promise.all([
    getAllCategories(),
    searchProductsServer(q, 48, productType),
  ])

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: 'חיפוש' }]} />

        <header className="category-page__header">
          <h1 className="category-page__title">
            {q ? `תוצאות חיפוש עבור "${q}"` : 'חיפוש מוצרים'}
          </h1>
          {q.length >= MIN_QUERY && (
            <p className="category-page__count">
              נמצאו {total} מוצרים
              {engine === 'meilisearch' && ' · Meilisearch'}
            </p>
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
            ) : results.length > 0 ? (
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
            ) : (
              <div className="category-page__empty">
                <p>לא נמצאו מוצרים עבור "{q}".</p>
                <p>נסו מילת חיפוש אחרת.</p>
              </div>
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
