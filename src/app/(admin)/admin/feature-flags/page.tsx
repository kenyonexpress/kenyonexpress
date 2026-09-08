import { listCapabilities, listFeatureFlags, listOperationalFlags } from '@/lib/admin/feature-flags'
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
  const operational = listOperationalFlags()
  const capabilities = listCapabilities()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">דגלי מערכת</h1>
        <p className="mt-1 text-sm text-gray-600">
          מתגי כיבוי שקוראים משתני סביבה בזמן הקריאה, לא בטעינת המודול. כיבוי הוא ערך מפורש בלבד:{' '}
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

      {/* The second table exists because the first one read as the whole flag
          surface and was not. Measured 2026-09-08: seven environment variables
          gate real behaviour and none of them appeared here - including
          CARDCOM_USE_MOCK, which decides whether a charge is real money, and
          which KNOWN-ISSUES #1 records as the launch blocker. A page titled
          "system flags" that omits it is not merely incomplete, it is
          reassuring. They are separate because none has a degraded path in the
          kill-switch sense: turning phone sign-in off removes a feature, and
          turning the payment mock ON replaces real money with pretend money. */}
      <header>
        <h2 className="text-xl font-bold text-gray-900">מתגים תפעוליים</h2>
        <p className="mt-1 text-sm text-gray-600">
          אלה אינם מתגי-כיבוי: אין להם מסלול מנוון תקין, הם פשוט מפעילים או מכבים התנהגות. גם הם
          משתני סביבה ב-Vercel.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">מתג</th>
              <th className="px-4 py-3 font-medium">משתנה</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">מה זה עושה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {operational.map((flag) => (
              <tr key={flag.envName}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {flag.labelHe}
                  {flag.money && (
                    <span className="ms-2 rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                      כסף
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                  {flag.envName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${
                      flag.on
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-gray-200 bg-gray-50 text-gray-700'
                    }`}
                  >
                    {flag.on ? 'דולק' : 'כבוי'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{flag.effectHe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* /api/ready checks seven dependencies and deliberately checks neither
          Sentry nor Axiom: a readiness probe answers "can this instance serve
          traffic", and a reporting outage does not stop the shop working.
          Putting them there would take the shop out of rotation for it. But
          that leaves both silently inert with nowhere to look - axiom.ts opens
          with "ENTIRELY INERT without AXIOM_TOKEN + AXIOM_DATASET", and an
          unset DSN produces no error either, only silence where the reports
          would be. The thing that tells you everything else is broken is the
          one thing nothing tells you about. Presence only; no value is ever
          rendered. */}
      <header>
        <h2 className="text-xl font-bold text-gray-900">יכולות תצפית</h2>
        <p className="mt-1 text-sm text-gray-600">
          אלה אינם מתגים אלא הגדרות שקיומן שקט: בלעדיהן שום דבר אינו נכשל, פשוט אין דיווח.{' '}
          <span dir="ltr">/api/ready</span> אינו בודק אותן בכוונה — תקלה בדיווח אינה סיבה להוציא את
          החנות מרוטציה. מוצג קיום בלבד, לעולם לא הערך.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">יכולת</th>
              <th className="px-4 py-3 font-medium">משתנים</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">מה קורה בלעדיה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {capabilities.map((capability) => (
              <tr key={capability.labelHe}>
                <td className="px-4 py-3 font-medium text-gray-900">{capability.labelHe}</td>
                <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                  {capability.envNames.join(' + ')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${
                      capability.configured
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    {capability.configured ? 'מוגדר' : 'לא מוגדר'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{capability.whenAbsentHe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
