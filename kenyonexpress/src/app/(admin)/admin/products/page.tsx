import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge, { productStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { deleteProduct } from '@/server/actions/admin/products'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'מוצרים' }

export default async function AdminProductsPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select(
      'id, name_he, slug, status, base_price, type, created_at, vendors(business_name), categories(name_he)',
    )
    .order('created_at', { ascending: false })

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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">שם</th>
              <th className="px-5 py-3 font-medium">ספק</th>
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
              const vendor = Array.isArray(product.vendors) ? product.vendors[0] : product.vendors
              const category = Array.isArray(product.categories)
                ? product.categories[0]
                : product.categories
              return (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      {product.name_he}
                    </Link>
                    <div className="text-xs text-gray-400 font-mono">{product.slug}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{vendor?.business_name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{category?.name_he ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{product.base_price.toLocaleString('he-IL')}
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
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-brand text-sm hover:underline"
                      >
                        עריכה
                      </Link>
                      <DeleteButton onConfirm={() => deleteProduct(product.id)} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {!products?.length && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין מוצרים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
