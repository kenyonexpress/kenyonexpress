import { listFeatureFlags } from '@/lib/admin/feature-flags'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'דגלי מערכת' }

/**
 * Read-only kill switches. Flipping one is an env change on Vercel, documented
 * in docs/RUNBOOK.md. This page does not write anything: there is no flags
 * table, and this repository does not apply migrations from an agent.
 */
export default async function AdminFeatureFlagsPage() {
  await requireSection('analytics')
  const flags = listFeatureFlags()

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
    </div>
  )
}
