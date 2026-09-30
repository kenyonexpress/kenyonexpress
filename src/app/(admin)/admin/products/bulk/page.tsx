import ProductBulkEditClient from '@/components/admin/ProductBulkEditClient'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireAdminPage } from '@/lib/admin/rbac'
import { isR2StorageConfigured } from '@/lib/storage/r2-service'
import { createClient } from '@/lib/supabase/server'
import { History } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'עריכה קבוצתית של מוצרים' }

const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50'

/**
 * Scoped bulk edit: pick the products by SKU glob / name / category / status
 * / type, pick one operation (prices, stock, discount, find-and-replace,
 * images from R2 by SKU), see the dry run, apply in batches. Every run lands
 * in the import history with a whole-run undo.
 *
 * Admin tier only, like the import: one press here can touch the whole
 * catalogue, and the actions refuse anything below that tier. Money
 * operations are hidden for a role that cannot see money, same as the list.
 */
export default async function ProductBulkEditPage() {
  const session = await requireAdminPage()
  const supabase = await createClient()
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name_he')
    .order('name_he')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">עריכה קבוצתית של מוצרים</h1>
        <Link href="/admin/products/import/history" className={btnGhost}>
          <History className="h-4 w-4" aria-hidden />
          היסטוריה וביטול
        </Link>
      </div>
      {categoriesError ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          רשימת הקטגוריות לא נטענה: {categoriesError.message}
        </p>
      ) : null}
      <ProductBulkEditClient
        categories={categories ?? []}
        hidePricing={!canSeeMoney(session.role)}
        r2Configured={isR2StorageConfigured()}
      />
    </div>
  )
}
