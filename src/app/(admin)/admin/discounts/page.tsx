import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { growthClient } from '@/lib/growth/client'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(new Date(iso)) : '—'

/** What the campaign is worth, phrased the way the admin entered it. */
function worth(c: { kind: string; used_count: number; max_uses: number | null }) {
  return c.max_uses === null ? `${c.used_count} / ∞` : `${c.used_count} / ${c.max_uses}`
}

function windowState(c: {
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
}) {
  const now = Date.now()
  if (!c.is_active) return { label: 'כבוי', tone: 'off' as const }
  if (c.starts_at && new Date(c.starts_at).getTime() > now)
    return { label: 'ממתין', tone: 'pending' as const }
  if (c.expires_at && new Date(c.expires_at).getTime() <= now)
    return { label: 'פג', tone: 'off' as const }
  return { label: 'פעיל', tone: 'live' as const }
}

export default async function DiscountsPage() {
  const session = await requireSection('discounts', 'read')
  const canWrite = canWriteSection(session.role, 'discounts')

  const { data, error } = await growthClient().campaigns().list()
  const campaigns = data ?? []

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">קודי הנחה</h1>
          <p className="text-sm text-gray-600 mt-1">
            קמפיינים של הפלטפורמה. ההנחה יוצאת מעמלת הפלטפורמה בלבד ולעולם לא מחלקו של הספק.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/admin/discounts/new"
            className="rounded-lg bg-black px-4 py-2 text-white text-sm font-medium"
          >
            קמפיין חדש
          </Link>
        )}
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינת הקמפיינים נכשלה: {error.message}
        </p>
      )}

      {campaigns.some((c) => c.counter_drift) && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          לקמפיין אחד או יותר מונה השימושים אינו תואם את יומן המימושים. פירוש הדבר שמישהו כתב ל-
          <code>used_count</code> מחוץ ל-<code>fn_claim_discount</code>, והמגבלות אינן נאכפות כרגע.
        </p>
      )}

      {campaigns.length === 0 && !error ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין עדיין קמפיינים.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">קוד</th>
                <th className="px-4 py-3 font-medium">שם</th>
                <th className="px-4 py-3 font-medium">מצב</th>
                <th className="px-4 py-3 font-medium">שימושים</th>
                <th className="px-4 py-3 font-medium">משתמשים</th>
                <th className="px-4 py-3 font-medium">סך ההנחה</th>
                <th className="px-4 py-3 font-medium">צבירה</th>
                <th className="px-4 py-3 font-medium">חלון</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => {
                const state = windowState(c)
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/discounts/${c.id}`}
                        className="font-mono font-medium underline"
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          state.tone === 'live'
                            ? 'rounded bg-green-100 px-2 py-1 text-xs text-green-800'
                            : state.tone === 'pending'
                              ? 'rounded bg-blue-100 px-2 py-1 text-xs text-blue-800'
                              : 'rounded bg-gray-100 px-2 py-1 text-xs text-gray-700'
                        }
                      >
                        {state.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{worth(c)}</bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{c.distinct_users}</bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{ils(c.total_discount_agorot)}</bdi>
                    </td>
                    <td className="px-4 py-3">
                      {c.allow_stacking ? (
                        <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
                          מותרת
                        </span>
                      ) : (
                        <span className="text-gray-400">כבויה</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <bdi>
                        {date(c.starts_at)} — {date(c.expires_at)}
                      </bdi>
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
