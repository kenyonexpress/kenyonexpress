import StatusBadge from '@/components/admin/StatusBadge'
import { requireAdminSession } from '@/lib/admin/rbac'
import { formatDateShort } from '@/lib/i18n/format'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import DealsQueueActionsClient from './DealsQueueActionsClient'

export const metadata = { title: 'תור דילים' }

const SOURCE_LABEL_HE: Record<string, string> = { feed: 'פיד אוטומטי', manual: 'הגשה ידנית' }
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

type CandidateRow = {
  id: string
  supplier_id: string
  source: string
  name_he: string
  price_agorot: number
  full_price_agorot: number | null
  discount_percent: number | null
  category_text: string | null
  link_url: string
  image_url: string | null
  fetched_at: string
  suppliers: { name: string } | { name: string }[] | null
}

/**
 * Every `deal_candidates` row still 'pending_review', oldest first.
 *
 * Approve/reject only -- this page never creates a public.products row.
 * See docs/DEALS-PIPELINE.md for why, and for what "approved" means here.
 */
export default async function DealsQueuePage() {
  await requireAdminSession()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('deal_candidates' as never)
    .select(
      'id, supplier_id, source, name_he, price_agorot, full_price_agorot, discount_percent, category_text, link_url, image_url, fetched_at, suppliers(name)',
    )
    .eq('status', 'pending_review')
    .order('fetched_at', { ascending: true })

  if (error && !TABLE_ABSENT.has(error.code ?? '')) {
    throw new Error(`deal_candidates read failed: ${error.message}`)
  }

  const rows = (error ? [] : (data ?? [])) as unknown as CandidateRow[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">תור דילים</h1>
        <StatusBadge label={`${rows.length} ממתינים`} variant={rows.length ? 'yellow' : 'green'} />
      </div>
      <p className="text-sm text-gray-500">
        דילים שספקים הגישו — בפיד אוטומטי או ידנית — וממתינים לבדיקת מנהל. אישור כאן מסמן שהדיל נבדק
        ואינו מפרסם מוצר; ראו docs/DEALS-PIPELINE.md.
      </p>

      {error ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
          תור הדילים עדיין לא זמין (מיגרציה 237 טרם הוחלה).
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
          אין דילים ממתינים.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-start text-xs text-gray-500">
                <th className="px-5 py-3 text-start font-medium">שם</th>
                <th className="px-5 py-3 text-start font-medium">ספק</th>
                <th className="px-5 py-3 text-start font-medium">מקור</th>
                <th className="px-5 py-3 text-start font-medium">מחיר</th>
                <th className="px-5 py-3 text-start font-medium">קטגוריה (חופשי)</th>
                <th className="px-5 py-3 text-start font-medium">קישור</th>
                <th className="px-5 py-3 text-start font-medium">התקבל</th>
                <th className="px-5 py-3 text-start font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
                return (
                  <tr key={row.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {row.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- an
                          // arbitrary supplier-supplied URL, not an optimizable local asset
                          <img
                            src={row.image_url}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded object-cover"
                          />
                        ) : null}
                        <span>{row.name_he}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{supplier?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {SOURCE_LABEL_HE[row.source] ?? row.source}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {shekelsFromIlsRounded(row.price_agorot / 100)}
                      {row.full_price_agorot ? (
                        <span className="ms-1 text-xs text-gray-400 line-through">
                          {shekelsFromIlsRounded(row.full_price_agorot / 100)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{row.category_text ?? '—'}</td>
                    <td className="px-5 py-3">
                      <a
                        href={row.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="text-xs text-brand underline"
                      >
                        {new URL(row.link_url).hostname}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {formatDateShort(row.fetched_at)}
                    </td>
                    <td className="px-5 py-3">
                      <DealsQueueActionsClient candidateId={row.id} candidateName={row.name_he} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
