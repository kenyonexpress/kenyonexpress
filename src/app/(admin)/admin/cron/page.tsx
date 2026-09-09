import { requireSection } from '@/lib/admin/rbac'
import { type JobStatus, fetchCronRuns, jobsFailingRepeatedly } from '@/server/queries/cron-runs'

/**
 * Every scheduled job, when it last ran, and how long it has been failing.
 *
 * WHY THIS IS NOT THE GITHUB ACTIONS PAGE. The Actions run records the CALL.
 * It is red when curl got a non-2xx and green otherwise, it expires, and it is
 * one line for a whole schedule rather than one per job. This screen reads
 * `job_runs`, which the routes write themselves, so it can say what a job did
 * and notice a run that was killed and never reported at all.
 *
 * `analytics` and not `payments`: three of the seventeen jobs touch money, but
 * knowing whether a job ran is operational, and gating it behind the money role
 * keeps it from the people most likely to look during an incident. Same
 * reasoning as /admin/status.
 */

export const metadata = { title: 'משימות מתוזמנות' }

type Tone = { label: string; className: string }

/** No row at all is its own state, and it is not a failure. */
const NEVER_SEEN: Tone = {
  label: 'לא נצפתה מעולם',
  className: 'bg-gray-50 text-gray-600 border-gray-200',
}

const STATUS_TONE: Record<JobStatus, Tone> = {
  ok: { label: 'הצליחה', className: 'bg-green-50 text-green-700 border-green-200' },
  failed: { label: 'נכשלה', className: 'bg-red-50 text-red-700 border-red-200' },
  running: { label: 'רצה', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function duration(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function tone(status: JobStatus | null): Tone {
  return status === null ? NEVER_SEEN : STATUS_TONE[status]
}

export default async function AdminCronPage() {
  await requireSection('analytics')
  const view = await fetchCronRuns()
  const alerting = jobsFailingRepeatedly(view.health, view.failureThreshold)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">משימות מתוזמנות</h1>
        <p className="mt-1 text-sm text-gray-600">
          {view.health.length} משימות ב-<code>scripts/cron-jobs.json</code>, שהוא המקור היחיד
          לזמנים. הדף קורא את <code>job_runs</code>, שהמשימות עצמן כותבות, ולא את יומן ה-Actions.
        </p>
      </header>

      {view.tableMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">הטבלה עדיין לא קיימת.</strong> ‏
          <code>migrations/pending/228_job_runs.sql</code> ממתינה לאישור, ולכן שום ריצה אינה נרשמת
          וכל השורות למטה ריקות מסיבה אחת ידועה. זה <em>אינו</em> אומר שהמשימות לא רצות: הן רצות,
          ואף אחת לא מדווחת. הכתיבה יורדת לאין-פעולה עד שהמיגרציה תוחל, ואז הדף מתמלא מעצמו.
        </div>
      ) : alerting.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">
            {alerting.length} משימות נכשלו {view.failureThreshold} פעמים ברצף או יותר:
          </strong>{' '}
          {alerting.map((job) => job.jobName).join(', ')}. כישלון בודד הוא בדרך כלל ריצת GitHub
          שנפלה; שניים ברצף הם תקלה.
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          אף משימה לא נכשלה {view.failureThreshold} פעמים ברצף.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">משימה</th>
              <th className="px-4 py-3 font-medium">תזמון</th>
              <th className="px-4 py-3 font-medium">ריצה אחרונה</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">משך</th>
              <th className="px-4 py-3 font-medium">כשלים ברצף</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {view.health.map((job) => (
              <tr key={job.jobName}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <code>{job.jobName}</code>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <code>{job.cron ?? 'לא בתזמון'}</code>
                </td>
                <td className="px-4 py-3 text-gray-600">{when(job.lastStartedAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${tone(job.lastStatus).className}`}
                  >
                    {tone(job.lastStatus).label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{duration(job.lastDurationMs)}</td>
                <td
                  className={`px-4 py-3 ${
                    job.consecutiveFailures >= view.failureThreshold
                      ? 'font-semibold text-red-700'
                      : 'text-gray-600'
                  }`}
                >
                  {job.consecutiveFailures}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {view.recent.length} הריצות האחרונות
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">משימה</th>
                  <th className="px-4 py-3 font-medium">התחילה</th>
                  <th className="px-4 py-3 font-medium">מצב</th>
                  <th className="px-4 py-3 font-medium">HTTP</th>
                  <th className="px-4 py-3 font-medium">משך</th>
                  <th className="px-4 py-3 font-medium">מה נספר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {view.recent.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-gray-900">
                      <code>{run.jobName}</code>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{when(run.startedAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          tone(run.status).className
                        }`}
                      >
                        {tone(run.status).label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{run.httpStatus ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{duration(run.durationMs)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {Object.keys(run.detail).length === 0
                        ? '—'
                        : Object.entries(run.detail)
                            .map(([key, value]) => `${key}=${String(value)}`)
                            .join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        שורה שנשארת במצב <strong>רצה</strong> יותר משעה נספרת ככישלון, ובכוונה: קריאה שנהרגה באמצע
        אינה מחזירה שום סטטוס, והשורה הפתוחה הזאת היא העקבה היחידה שהיא משאירה. משימה שלא נצפתה
        מעולם אינה נספרת ככישלון, כי היא לא נכשלה, פשוט אין עליה שום עדות.
      </p>
    </div>
  )
}
