import ProductCard from '@/components/ProductCard'
import SearchBox from '@/components/search/SearchBox'
import { searchProductsServer } from '@/lib/search-server'
import type { Metadata } from 'next'

type Props = {
  searchParams: Promise<{ q?: string | string[] }>
}

function firstStr(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = firstStr((await searchParams).q).trim()
  return {
    title: q ? `תוצאות חיפוש: ${q}` : 'חיפוש מוצרים',
    description: q ? `תוצאות חיפוש עבור "${q}" בקניון אקספרס` : 'חיפוש מוצרים בקניון אקספרס',
    robots: { index: false },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const q = firstStr((await searchParams).q).trim()
  const { results, total, engine } = await searchProductsServer(q)

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="נתיב ניווט">
        <a href="/" className="hover:text-brand-dark">
          בית
        </a>
        <span className="text-gray-300">/</span>
        <span className="font-medium text-brand-dark">חיפוש</span>
      </nav>

      <div>
        <h1 className="text-2xl font-black text-brand-dark">
          {q ? (
            <>
              תוצאות חיפוש עבור <span className="text-price">"{q}"</span>
            </>
          ) : (
            'חיפוש מוצרים'
          )}
        </h1>
        {q && (
          <p className="mt-1 text-sm text-gray-500">
            נמצאו {total} מוצרים
            {engine === 'meilisearch' && <span className="text-gray-300"> · Meilisearch</span>}
          </p>
        )}
      </div>

      <SearchBox defaultValue={q} />

      {q.length < 2 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">
          <p className="mb-2 text-5xl">🔎</p>
          <p className="font-semibold text-gray-600">הקלידו לפחות 2 תווים כדי לחפש</p>
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} variant="deals" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">
          <p className="mb-2 text-5xl">😕</p>
          <p className="font-semibold text-gray-600">לא נמצאו מוצרים עבור "{q}"</p>
          <p className="mt-1 text-sm">נסו מילת חיפוש אחרת</p>
        </div>
      )}
    </div>
  )
}
