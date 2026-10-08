import FlashSaleRowActions from '@/components/admin/FlashSaleRowActions'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { type AdminFlashSale, listFlashSalesForAdmin } from '@/lib/flash-sales/admin-read'
import { phaseOf } from '@/lib/flash-sales/rules'
import Link from 'next/link'

export const metadata = { title: 'מבצעי בזק' }

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

const when = (iso: string) =>
  new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

function stateOf(sale: AdminFlashSale): { label: string; tone: 'live' | 'pending' | 'off' } {
  const phase = phaseOf(sale, new Date())
  if (phase === 'off') return { label: 'כבוי', tone: 'off' }
  if (phase === 'upcoming') return { label: 'ממתין', tone: 'pending' }
  if (phase === 'ended') return { label: 'הסתיים', tone: 'off' }
  if (sale.product_status !== 'active') return { label: 'מוצר לא פעיל', tone: 'pending' }
  return { label: 'פעיל', tone: 'live' }
}

const TONE = {
  live: 'rounded bg-green-100 px-2 py-1 text-xs text-green-800',
  pending: 'rounded bg-amber-100 px-2 py-1 text-xs text-amber-900',
  off: 'rounded bg-gray-100 px-2 py-1 text-xs text-gray-700',
} as const

/**
 * Every flash sale (STEP 61) with its allocation, what is spoken for, how
 * many are waiting and how many paid. Support reads; admin composes. A flash
 * price is a price cut, which is why this lives under the discounts
 * permission and not the catalogue.
 */
export default async function FlashSalesPage() {
  const session = await requireSection('discounts', 'read')
  const canWrite = canWriteSection(session.role, 'discounts')
  const { sales, tableExists, error } = await listFlashSalesForAdmin()

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">מבצעי בזק</h1>
          <p className="mt-1 text-sm text-gray-600">
            מוצר במחיר נמוך לחלון זמן קצוב, במספר יחידות קבוע. קונה שתופס יחידה מקבל אותה שמורה
            לדקות ספורות; כשהיחידות נגמרות נפתח חדר המתנה לפי סדר הגעה.
          </p>
        </div>
        {canWrite && tableExists && (
          <Link
            href="/admin/flash-sales/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            מבצע בזק חדש
          </Link>
        )}
      </header>

      {!tableExists && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          טבלאות מבצעי הבזק עוד לא הוחלו (מיגרציה 266). עד אז האתר לא מציג מבצעי בזק.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינת המבצעים נכשלה: {error}
        </p>
      )}

      {tableExists && sales.length === 0 && !error ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין עדיין מבצעי בזק.
        </p>
      ) : (
        sales.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium">שם</th>
                  <th className="px-4 py-3 font-medium">מצב</th>
                  <th className="px-4 py-3 font-medium">מוצר</th>
                  <th className="px-4 py-3 font-medium">מחיר בזק</th>
                  <th className="px-4 py-3 font-medium">יחידות</th>
                  <th className="px-4 py-3 font-medium">בתור</th>
                  <th className="px-4 py-3 font-medium">חלון</th>
                  {canWrite && <th className="px-4 py-3 font-medium">פעולות</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sales.map((sale) => {
                  const state = stateOf(sale)
                  return (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/flash-sales/${sale.id}`}
                          className="font-medium underline"
                        >
                          {sale.name_he}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={TONE[state.tone]}>{state.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {sale.product_name_he ?? sale.product_id}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <bdi>{ils(sale.price_agorot)}</bdi>
                        {sale.reference_agorot !== null && (
                          <span className="ms-2 text-xs text-gray-500 line-through">
                            <bdi>{ils(sale.reference_agorot)}</bdi>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">
                        <bdi>
                          {sale.taken} / {sale.allocation}
                        </bdi>
                        <span className="block text-xs text-gray-500">{sale.consumed} נמכרו</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{sale.queued}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <bdi>
                          {when(sale.starts_at)} — {when(sale.ends_at)}
                        </bdi>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <FlashSaleRowActions
                            id={sale.id}
                            isActive={sale.is_active}
                            name={sale.name_he}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
