import { MIGRATION_MANIFEST, type MigrationState } from '@/lib/admin/migration-manifest'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'מיגרציות' }

/**
 * What the repository is holding, and what is waiting for a yes.
 *
 * WHAT THIS PAGE IS NOT: it is not a view of the database, and it does not
 * apply anything. Applying a migration is one of the four things that stop for
 * an explicit approval, and a button here would be the fastest way to lose that
 * rule. The list comes from `migration-manifest.ts`, which is generated from the
 * directories and gated by a test, so it says what the REPO holds.
 *
 * WHY THAT DISTINCTION IS ON THE PAGE ITSELF, in Hebrew, rather than only here:
 * on 2026-09-07 twenty-one comments across the source said `migrations/pending/`
 * about files that had been applied to production months earlier. A screen that
 * quietly implies "pending = production does not have it" would be the same
 * mistake with a nicer font.
 *
 * `audit-log` and not `dashboard`: a schema change is the same class of thing as
 * the audit trail, and both are admin-only. Support does not need it and the
 * catalogue role must not see it.
 */

const STATE_LABEL: Record<MigrationState, string> = {
  pending: 'ממתינה לאישור',
  applied: 'הוחלה',
  cancelled: 'בוטלה',
}

const STATE_CLASS: Record<MigrationState, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  applied: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
}

const ORDER: MigrationState[] = ['pending', 'cancelled', 'applied']

export default async function AdminMigrationsPage() {
  await requireSection('audit-log')

  const groups = ORDER.map((state) => ({
    state,
    rows: MIGRATION_MANIFEST.filter((entry) => entry.state === state).sort((a, b) =>
      b.number.localeCompare(a.number, 'en', { numeric: true }),
    ),
  })).filter((group) => group.rows.length > 0)

  const pending = MIGRATION_MANIFEST.filter((e) => e.state === 'pending')
  const unaudited = pending.filter((e) => !e.hasPreflight)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">מיגרציות</h1>
        <p className="mt-1 text-sm text-gray-600">
          {pending.length} ממתינות לאישור מתוך {MIGRATION_MANIFEST.length} קבצים.
        </p>
      </header>

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        המסך הזה מתאר את <strong>הריפו</strong> ולא את בסיס הנתונים. "ממתינה" פירושה שאף אחד לא אישר
        את הקובץ, ולא שהשינוי חסר בפרודקשן. התשובה של בסיס הנתונים עצמו נמצאת ב-
        <code className="mx-1 rounded bg-white px-1 py-0.5 text-xs">
          supabase_migrations.schema_migrations
        </code>
        . אין כאן כפתור החלה בכוונה: החלה היא אחת הפעולות שדורשות אישור מפורש.
      </p>

      {unaudited.length > 0 ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {unaudited.length} מיגרציות ממתינות בלי קובץ preflight לצידן:{' '}
          {unaudited.map((e) => e.number).join(', ')}.
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.state} className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">
            {STATE_LABEL[group.state]} ({group.rows.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">מספר</th>
                  <th className="px-3 py-2 text-start font-medium">קובץ</th>
                  <th className="px-3 py-2 text-start font-medium">מצב</th>
                  <th className="px-3 py-2 text-start font-medium">preflight</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((entry) => (
                  <tr key={entry.file} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700" dir="ltr">
                      {entry.number}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700" dir="ltr">
                      {entry.file}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATE_CLASS[entry.state]}`}
                      >
                        {STATE_LABEL[entry.state]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {entry.state === 'pending' ? (entry.hasPreflight ? 'יש' : 'חסר') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
