import { requireSection } from '@/lib/admin/rbac'
import { type DependencyStatus, runHealthChecks } from '@/lib/health/checks'

/**
 * What this deployment is actually running, for an admin.
 *
 * The public `/api/health` is deliberately coarse - it is unauthenticated, so
 * anything it says is public, and a detailed health endpoint is a free
 * inventory of what you run and what is broken. This page is the detailed view,
 * behind the same RBAC gate as the money screens.
 *
 * `dashboard` and not `payments`: knowing whether search is up is operational,
 * not financial, and gating it behind the money role would keep it from the
 * people most likely to look at it during an outage.
 */

export const metadata = { title: 'סטטוס מערכת' }

const TONE: Record<DependencyStatus, { label: string; className: string }> = {
  ok: { label: 'תקין', className: 'bg-green-50 text-green-700 border-green-200' },
  down: { label: 'למטה', className: 'bg-red-50 text-red-700 border-red-200' },
  not_configured: { label: 'לא מוגדר', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const TITLES: Record<string, string> = {
  database: 'בסיס הנתונים',
  rate_limiter: 'הגבלת קצב',
  search: 'חיפוש',
  cardcom: 'סליקה',
  email: 'דואר יוצא',
  storage: 'אחסון קבצים',
  scheduler: 'משימות מתוזמנות',
}

export default async function AdminStatusPage() {
  await requireSection('dashboard')
  const report = await runHealthChecks()

  const checked = new Date(report.checkedAt).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">סטטוס מערכת</h1>
        <p className="mt-1 text-sm text-gray-600">
          נבדק עכשיו, {checked}. הדף אינו נשמר במטמון: בדיקת בריאות שנשמרת במטמון היא שקר עם חותמת
          זמן.
        </p>
      </header>

      <div
        className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          report.ok
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}
      >
        {report.ok ? 'אף תלות אינה למטה.' : 'יש תלות שאינה עונה. פירוט למטה, והתראה נשלחה ל-ntfy.'}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">תלות</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">זמן תגובה</th>
              <th className="px-4 py-3 font-medium">פירוט</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.dependencies.map((dependency) => {
              const tone = TONE[dependency.status]
              return (
                <tr key={dependency.name}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {TITLES[dependency.name] ?? dependency.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone.className}`}>
                      {tone.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {dependency.latencyMs === null ? '—' : `${dependency.latencyMs} ms`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{dependency.detail}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-gray-500">
        &quot;לא מוגדר&quot; אינו תקלה ואינו שולח התראה: זו התקנה שלא הושלמה, וזו עובדה אחרת. התראה
        נשלחת רק על תלות שאינה עונה, כי התראה שיורה תמיד היא התראה שאיש לא קורא. אין כאן Redis:
        הגבלת הקצב רצה ב-Postgres דרך `check_rate_limit`, ולכן היא נבדקת שם.
      </p>
    </div>
  )
}
