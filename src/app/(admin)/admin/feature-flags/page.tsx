import FeatureFlagToggle from '@/components/admin/FeatureFlagToggle'
import { listFeatureFlags } from '@/lib/admin/feature-flags'
import { requireSection } from '@/lib/admin/rbac'
import { FEATURE_FLAG_KEYS, FEATURE_FLAG_LABEL_HE } from '@/lib/resilience/feature-flags'
import { isMaintenanceMode } from '@/lib/resilience/maintenance'
import { listFeatureFlagRows } from '@/server/resilience/flags'

export const metadata = { title: 'דגלי מערכת' }

/**
 * Read-only kill switches. Flipping one is an env change on Vercel, documented
 * in docs/RUNBOOK.md. This page does not write anything: there is no flags
 * table, and this repository does not apply migrations from an agent.
 */
export default async function AdminFeatureFlagsPage() {
  await requireSection('analytics')
  const flags = listFeatureFlags()
  const dbFlags = await listFeatureFlagRows(FEATURE_FLAG_KEYS)
  const maintenance = isMaintenanceMode()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">דגלי מערכת</h1>
        <p className="mt-1 text-sm text-gray-600">
          ארבעה מתגים שקוראים משתני סביבה בזמן הקריאה, לא בטעינת המודול. כיבוי הוא ערך מפורש בלבד:{' '}
          <span dir="ltr">1 / true / on / yes</span>. שינוי ב-Vercel חל על המופע הבא, לא על זה שכבר
          מגיש את הבקשה שהעירה אתכם. פירוט והחזרה לאחור ב-
          <span dir="ltr">docs/RUNBOOK.md</span>.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">מערכת</th>
              <th className="px-4 py-3 font-medium">משתנה</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">התנהגות כבויה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <tr key={flag.subsystem}>
                <td className="px-4 py-3 font-medium text-gray-900">{flag.labelHe}</td>
                <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                  {flag.envName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${
                      flag.on
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-green-200 bg-green-50 text-green-800'
                    }`}
                  >
                    {flag.on ? 'כבוי במתג' : 'רץ'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{flag.degradedHe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">דגלי מוצר (טבלה)</h2>
        <p className="text-sm text-gray-600">
          הדגלים המתועדים ב-docs/ARCHITECTURE-FEATURE-FLAGS.md, עם מקור התשובה של כל אחד: הסביבה
          גוברת על הטבלה, הטבלה על ברירת המחדל. שינוי כאן חל תוך 30 שניות על כל מופע ונרשם
          ב-audit_log. מתגי ההרג ומצב התחזוקה נשארים בסביבה בלבד, בכוונה (docs/RESILIENCE.md).
        </p>
        {dbFlags.tableMissing ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            הטבלה עדיין לא הוחלה. הקובץ ממתין ב-migrations/pending/235_feature_flags.sql; עד אז כל
            דגל עונה מהסביבה או מברירת המחדל שלו.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">דגל</th>
                <th className="px-4 py-3 font-medium">מפתח</th>
                <th className="px-4 py-3 font-medium">תשובה</th>
                <th className="px-4 py-3 font-medium">מקור</th>
                <th className="px-4 py-3 font-medium">פעולה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dbFlags.rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {FEATURE_FLAG_LABEL_HE[row.key]}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    {row.key}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${
                        row.enabled
                          ? 'border-green-200 bg-green-50 text-green-800'
                          : 'border-gray-200 bg-gray-50 text-gray-700'
                      }`}
                    >
                      {row.enabled ? 'דלוק' : 'כבוי'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600" dir="ltr">
                    {row.source}
                  </td>
                  <td className="px-4 py-3">
                    {dbFlags.tableMissing ? null : (
                      <FeatureFlagToggle
                        flagKey={row.key}
                        enabled={row.tableValue ?? row.enabled}
                        lockedByEnv={row.source === 'env'}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">מצב תחזוקה</h2>
        <p className="text-sm text-gray-600">
          <span dir="ltr">MAINTENANCE_MODE</span> נקרא ב-proxy מהסביבה בכל בקשה: החנות מחזירה 503 עם
          דף עברי ו-Retry-After, והאדמין, הקרונים, /api/health והניטור נשארים. כרגע:{' '}
          <strong>{maintenance ? 'דלוק' : 'כבוי'}</strong>.
        </p>
      </section>
    </div>
  )
}
