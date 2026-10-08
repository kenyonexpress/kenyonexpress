import { requireSection } from '@/lib/admin/rbac'
import {
  MIN_EXPOSURES_PER_VARIANT,
  type Verdict,
  requiredExposuresPerVariant,
} from '@/lib/analytics/experiment-stats'
import { EXPERIMENTS, type ExperimentDefinition } from '@/lib/analytics/experiments'
import { landingExperiments } from '@/lib/landing/experiments'
import { listLandingPages } from '@/lib/landing/read'
import { type ExperimentReport, loadExperimentReport } from '@/server/analytics/experiments'
import Link from 'next/link'

export const metadata = { title: 'ניסויי A/B' }

const WINDOW_DAYS = 30

const VERDICT_HE: Record<Verdict, string> = {
  control: 'בקרה',
  insufficient: 'עוד אין מספיק חשיפות',
  inconclusive: 'אין הבדל מובהק',
  better: 'טוב יותר מהבקרה',
  worse: 'גרוע מהבקרה',
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`

/**
 * Every experiment the storefront can run, with its result over the last
 * 30 days: the registered ones (`analytics/experiments.ts`) and every
 * landing page with two or more arms. One pipeline for both: rows in,
 * identity-joined exposure and conversion counts, Wilson intervals and a
 * two-proportion z-test against control.
 *
 * Reads only. Changing an arm's weight is a landing page edit; changing the
 * checkout rollout is a PostHog flag.
 */
export default async function AdminExperimentsPage() {
  await requireSection('analytics')
  const landing = await listLandingPages()
  const landingDefinitions = landingExperiments(landing.pages)

  const entries: { experiment: ExperimentDefinition; report: ExperimentReport; slug?: string }[] =
    await Promise.all([
      ...EXPERIMENTS.map(async (experiment) => ({
        experiment,
        report: await loadExperimentReport(experiment, { days: WINDOW_DAYS }),
      })),
      ...landingDefinitions.map(async (experiment) => {
        const slug = experiment.key.slice('lp_'.length)
        return {
          experiment,
          slug,
          report: await loadExperimentReport(experiment, {
            days: WINDOW_DAYS,
            exposureFilter: { prop: 'lp_slug', value: slug },
          }),
        }
      }),
    ])

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">ניסויי A/B</h1>
        <p className="mt-1 text-sm text-gray-600">
          {WINDOW_DAYS} הימים האחרונים, מאירועי צד-ראשון. חשיפה היא זהות שראתה גרסה (עגלה אנונימית,
          ואם אין, משתמש, ואם אין, סשן); המרה היא רכישה של אותה זהות. אין פסק דין מתחת ל-
          {MIN_EXPOSURES_PER_VARIANT} חשיפות בזרוע.
        </p>
      </header>

      {entries.length === 0 && <p className="text-sm text-gray-500">אין ניסויים.</p>}

      {entries.map(({ experiment, report, slug }) => (
        <section key={experiment.key} className="rounded-xl border border-gray-200 bg-white p-5">
          <header className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {slug ? (
                <>
                  דף נחיתה{' '}
                  <span dir="ltr" className="font-mono">
                    /lp/{slug}
                  </span>
                </>
              ) : (
                <span dir="ltr" className="font-mono">
                  {experiment.flag}
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-gray-600">{experiment.hypothesisHe}</p>
          </header>

          {!report.ok ? (
            <p role="alert" className="text-sm text-red-700">
              הדוח לא נטען: {report.reason}
            </p>
          ) : (
            <>
              <table className="w-full text-start text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">גרסה</th>
                    <th className="px-3 py-2 font-medium">חשיפות</th>
                    <th className="px-3 py-2 font-medium">המרות</th>
                    <th className="px-3 py-2 font-medium">שיעור</th>
                    <th className="px-3 py-2 font-medium">רווח סמך 95%</th>
                    <th className="px-3 py-2 font-medium">שינוי</th>
                    <th className="px-3 py-2 font-medium">p</th>
                    <th className="px-3 py-2 font-medium">מסקנה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.stats.map((stat) => (
                    <tr key={stat.variant}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {experiment.variantLabelsHe[stat.variant] ?? stat.variant}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{stat.exposures}</td>
                      <td className="px-3 py-2 tabular-nums">{stat.conversions}</td>
                      <td className="px-3 py-2 tabular-nums">{pct(stat.rate)}</td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {pct(stat.ci95[0])} – {pct(stat.ci95[1])}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {stat.liftPct === null
                          ? '—'
                          : `${stat.liftPct > 0 ? '+' : ''}${stat.liftPct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {stat.pValue === null ? '—' : stat.pValue.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">{VERDICT_HE[stat.verdict]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                <div>
                  <dt className="inline">שורות שנקראו: </dt>
                  <dd className="inline tabular-nums">
                    {report.rows}
                    {report.truncated ? ' (נחתך בתקרה, המספרים חלקיים)' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="inline">זהויות שראו יותר מגרסה אחת: </dt>
                  <dd className="inline tabular-nums">{report.assignment.mixedIdentities}</dd>
                </div>
                <div>
                  <dt className="inline">רכישות בלי חשיפה בחלון: </dt>
                  <dd className="inline tabular-nums">{report.assignment.unexposedConversions}</dd>
                </div>
                <div>
                  <dt className="inline">חשיפות עם גרסה לא מוכרת: </dt>
                  <dd className="inline tabular-nums">{report.assignment.unknownVariantRows}</dd>
                </div>
                <div>
                  <dt className="inline">חשיפות נדרשות בזרוע לזיהוי שיפור של 20%: </dt>
                  <dd className="inline tabular-nums">
                    {requiredExposuresPerVariant(
                      Math.max(report.stats.find((s) => s.isControl)?.rate ?? 0, 0.001),
                      0.2,
                    )}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </section>
      ))}

      <p className="text-sm text-gray-600">
        דפי נחיתה חדשים וגרסאות שלהם נערכים ב-
        <Link href="/admin/landing-pages" className="text-blue-700 underline">
          דפי נחיתה
        </Link>
        .
      </p>
    </div>
  )
}
