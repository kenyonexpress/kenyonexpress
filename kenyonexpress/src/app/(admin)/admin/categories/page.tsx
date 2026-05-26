import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { deleteCategory } from '@/server/actions/admin/categories'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'קטגוריות' }

export default async function AdminCategoriesPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('*, parent:categories!parent_id(name_he)')
    .order('sort_order')
    .order('name_he')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">קטגוריות</h1>
        <Link
          href="/admin/categories/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          קטגוריה חדשה
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">שם</th>
              <th className="px-5 py-3 font-medium">מזהה</th>
              <th className="px-5 py-3 font-medium">אב</th>
              <th className="px-5 py-3 font-medium">סדר</th>
              <th className="px-5 py-3 font-medium">פעיל</th>
              <th className="px-5 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(categories ?? []).map((cat) => {
              const parent = Array.isArray(cat.parent) ? cat.parent[0] : cat.parent
              return (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    <Link
                      href={`/admin/categories/${cat.id}`}
                      className="text-brand hover:underline"
                    >
                      {cat.name_he}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
                  <td className="px-5 py-3 text-gray-600">{parent?.name_he ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{cat.sort_order}</td>
                  <td className="px-5 py-3">
                    <StatusBadge
                      label={cat.is_active ? 'פעיל' : 'לא פעיל'}
                      variant={cat.is_active ? 'green' : 'gray'}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/categories/${cat.id}`}
                        className="text-brand text-sm hover:underline"
                      >
                        עריכה
                      </Link>
                      <DeleteButton onConfirm={() => deleteCategory(cat.id)} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {!categories?.length && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  אין קטגוריות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
