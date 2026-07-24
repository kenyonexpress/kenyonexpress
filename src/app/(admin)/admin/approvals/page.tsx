import StatusBadge from '@/components/admin/StatusBadge'
import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ApprovalActionsClient from './ApprovalActionsClient'

export const metadata = { title: 'תור אישורים' }

const TYPE_LABELS: Record<string, string> = {
  physical: 'פיזי',
  service: 'שובר שירות',
  coupon: 'קופון',
}

export default async function ApprovalsQueuePage() {
  await requireAdminSession()
  const supabase = await createClient()

  const { data: pendingProducts } = await supabase
    .from('products')
    .select('id, name_he, slug, type, kenyon_price, submitted_at, created_by, suppliers(name)')
    .eq('approval_status', 'pending')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })

  const rows = pendingProducts ?? []

  // products.created_by points at auth.users (no FK to profiles), so creator
  // names are fetched separately.
  const creatorIds = [...new Set(rows.map((p) => p.created_by).filter(Boolean))] as string[]
  const { data: creators } = creatorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', creatorIds)
    : { data: [] }
  const creatorById = new Map(
    (creators ?? []).map((c: { id: string; full_name: string | null; email: string | null }) => [
      c.id,
      c,
    ]),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">תור אישורים</h1>
        <StatusBadge label={`${rows.length} ממתינים`} variant={rows.length ? 'yellow' : 'green'} />
      </div>
      <p className="text-sm text-gray-500">
        מוצרים שנוצרו או נערכו על ידי מעלי תוכן וממתינים לאישור מנהל לפני פרסום
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-start text-xs text-gray-500">
              <th className="px-5 py-3 text-start font-medium">מוצר</th>
              <th className="px-5 py-3 text-start font-medium">סוג</th>
              <th className="px-5 py-3 text-start font-medium">ספק</th>
              <th className="px-5 py-3 text-start font-medium">מחיר</th>
              <th className="px-5 py-3 text-start font-medium">הוגש על ידי</th>
              <th className="px-5 py-3 text-start font-medium">הוגש בתאריך</th>
              <th className="px-5 py-3 text-start font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((p) => {
              const supplier = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers
              const creator = p.created_by ? creatorById.get(p.created_by) : undefined
              return (
                <tr key={p.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/products/${p.id}/edit`}
                      className="font-medium text-[#000000] underline-offset-2 hover:underline"
                    >
                      {p.name_he}
                    </Link>
                    <div className="font-mono text-xs text-black/40">{p.slug}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{TYPE_LABELS[p.type] ?? p.type}</td>
                  <td className="px-5 py-3 text-gray-600">{supplier?.name ?? 'ללא'}</td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{(p.kenyon_price ?? 0).toLocaleString('he-IL')}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {creator?.full_name ?? creator?.email ?? 'לא ידוע'}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('he-IL') : 'ללא'}
                  </td>
                  <td className="px-5 py-3">
                    <ApprovalActionsClient productId={p.id} productName={p.name_he} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין מוצרים הממתינים לאישור
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
