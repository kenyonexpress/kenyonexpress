import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import ProductBulkClient from './ProductBulkClient'

export const metadata = { title: 'מוצרים' }

const PAGE_SIZE = 20

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'active', label: 'פעיל' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'paused', label: 'מושהה' },
  { value: 'archived', label: 'ארכיון' },
]

interface Props {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>
}

export default async function AdminProductsPage({ searchParams }: Props) {
  const { status, q, page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr ?? 1))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select(
      'id, name_he, slug, status, kenyon_price, type, is_featured, created_at, categories(name_he)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name_he', `%${q}%`)

  const { data: products, count } = await query
  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">מוצרים</h1>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          מוצר חדש
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {STATUS_FILTERS.map((f) => {
          const params = new URLSearchParams()
          if (f.value) params.set('status', f.value)
          if (q) params.set('q', q)
          return (
            <Link
              key={f.value}
              href={`/admin/products?${params}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                (status ?? '') === f.value
                  ? 'bg-brand text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-brand hover:text-brand'
              }`}
            >
              {f.label}
            </Link>
          )
        })}

        <form method="GET" action="/admin/products" className="flex gap-2 mr-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="חיפוש..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            סינון
          </button>
        </form>
      </div>

      <ProductBulkClient>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    data-select-all
                    className="w-4 h-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-5 py-3 font-medium">שם</th>
                <th className="px-5 py-3 font-medium">קטגוריה</th>
                <th className="px-5 py-3 font-medium">מחיר</th>
                <th className="px-5 py-3 font-medium">סוג</th>
                <th className="px-5 py-3 font-medium">סטטוס</th>
                <th className="px-5 py-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(products ?? []).map((product) => {
                const badge = productStatusBadge(product.status)
                const category = Array.isArray(product.categories)
                  ? product.categories[0]
                  : product.categories
                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        data-product-id={product.id}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-brand hover:underline font-medium"
                      >
                        {product.name_he}
                        {product.is_featured && (
                          <span className="mr-1 text-yellow-500 text-xs">★</span>
                        )}
                      </Link>
                      <div className="text-xs text-gray-400 font-mono">{product.slug}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{category?.name_he ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">
                      ₪{(product.kenyon_price ?? 0).toLocaleString('he-IL')}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        label={product.type === 'physical' ? 'פיזי' : 'קופון'}
                        variant={product.type === 'physical' ? 'blue' : 'yellow'}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge label={badge.label} variant={badge.variant} />
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-brand text-sm hover:underline"
                      >
                        עריכה
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {!products?.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                    אין מוצרים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ProductBulkClient>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          {page > 1 && (
            <Link
              href={`/admin/products?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(page - 1) })}`}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-brand"
            >
              הקודם
            </Link>
          )}
          <span className="text-xs text-gray-500">
            עמוד {page} מתוך {totalPages} ({total} מוצרים)
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/products?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(page + 1) })}`}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-brand"
            >
              הבא
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
