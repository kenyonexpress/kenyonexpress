import BundleRowActions from '@/components/admin/BundleRowActions'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { type AdminBundle, listBundlesForAdmin } from '@/lib/bundles/admin-read'
import { isBundleOpen } from '@/lib/bundles/evaluate'
import Link from 'next/link'

export const metadata = { title: 'חבילות מוצרים' }

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(new Date(iso)) : '—'

function stateOf(b: AdminBundle): { label: string; tone: 'live' | 'pending' | 'off' } {
  if (!b.is_active) return { label: 'כבויה', tone: 'off' }
  const now = new Date()
  if (b.starts_at && new Date(b.starts_at).getTime() > now.getTime()) {
    return { label: 'ממתינה', tone: 'pending' }
  }
  if (!isBundleOpen(b, now)) return { label: 'פגה', tone: 'off' }
  if (b.items.some((i) => i.status !== 'active')) return { label: 'מוצר לא פעיל', tone: 'pending' }
  return { label: 'פעילה', tone: 'live' }
}

const TONE = {
  live: 'rounded bg-green-100 px-2 py-1 text-xs text-green-800',
  pending: 'rounded bg-amber-100 px-2 py-1 text-xs text-amber-900',
  off: 'rounded bg-gray-100 px-2 py-1 text-xs text-gray-700',
} as const

/**
 * Every bundle (STEP 60), with its members and what it saves. Support reads;
 * admin composes. The saving comes out of the platform's commission, which
 * is why this lives under the discounts permission and not the catalogue.
 */
export default async function BundlesPage() {
  const session = await requireSection('discounts', 'read')
  const canWrite = canWriteSection(session.role, 'discounts')
  const { bundles, tableExists, error } = await listBundlesForAdmin()

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">חבילות מוצרים</h1>
          <p className="mt-1 text-sm text-gray-600">
            קנייה של כמה מוצרים יחד בחיסכון קבוע. החיסכון יורד מהתשלום באתר על כל סט שלם בעגלה,
            ויוצא מעמלת הפלטפורמה בלבד.
          </p>
        </div>
        {canWrite && tableExists && (
          <Link
            href="/admin/bundles/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            חבילה חדשה
          </Link>
        )}
      </header>

      {!tableExists && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          טבלאות החבילות עוד לא הוחלו (מיגרציה 265). עד אז העגלה מתמחרת כרגיל, בלי חבילות.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינת החבילות נכשלה: {error}
        </p>
      )}

      {tableExists && bundles.length === 0 && !error ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין עדיין חבילות.
        </p>
      ) : (
        bundles.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium">שם</th>
                  <th className="px-4 py-3 font-medium">מצב</th>
                  <th className="px-4 py-3 font-medium">מוצרים</th>
                  <th className="px-4 py-3 font-medium">חיסכון</th>
                  <th className="px-4 py-3 font-medium">חלון</th>
                  {canWrite && <th className="px-4 py-3 font-medium">פעולות</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {bundles.map((b) => {
                  const state = stateOf(b)
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/bundles/${b.id}`} className="font-medium underline">
                          {b.name_he}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={TONE[state.tone]}>{state.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {b.items.map((i) => (
                          <span key={i.product_id} className="block">
                            {i.name_he ?? i.product_id}
                            {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <bdi>{ils(b.discount_agorot)}</bdi>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <bdi>
                          {date(b.starts_at)} — {date(b.expires_at)}
                        </bdi>
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <BundleRowActions id={b.id} isActive={b.is_active} name={b.name_he} />
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
