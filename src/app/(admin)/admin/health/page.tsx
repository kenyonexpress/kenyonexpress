import { requireSection } from '@/lib/admin/rbac'
import { type DependencyReport, type DependencyStatus, runHealthChecks } from '@/lib/health/checks'
import {
  type HealthIncident,
  INCIDENT_LOG_LIMIT,
  formatIncidentDuration,
  incidentMinutes,
  listIncidents,
} from '@/lib/health/incidents'
import { PRIMARY_SERVICES, type PrimaryService } from '@/lib/health/services'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Site health for an admin (STEP 67): one card per service, green / red /
 * amber, and the incident log underneath.
 *
 * WHY THIS IS NOT `/api/health`. The public probe is deliberately coarse: it
 * is unauthenticated, so anything it says is public, and a detailed health
 * endpoint is a free inventory of what you run and what is broken. This page
 * is the detailed view, behind the same RBAC gate as the money screens.
 * `dashboard` and not `payments`: knowing whether search is up is
 * operational, not financial, and gating it behind the money role would keep
 * it from the people most likely to look during an outage.
 *
 * LIVE, NOT CACHED. The cards are the checks run on this request. A health
 * page served from a cache is a lie with a timestamp. The incident log is the
 * cron's view, not this request's: `lib/health/incidents.ts` says why there
 * is one writer, and the footer says what that means for the durations.
 *
 * SIX CARDS, THEN THE REST. The brief names DB, R2, Meilisearch, Resend,
 * Twilio and payments; those are the cards. The limiter, the read replica,
 * the offload Worker and the cron secret are real dependencies too, and
 * hiding them would be the green-for-unconfigured failure at page level, so
 * they follow as a compact table rather than being dropped.
 */

export const metadata = { title: 'בריאות המערכת' }

const TONE: Record<DependencyStatus, { label: string; dot: string; card: string; pill: string }> = {
  ok: {
    label: 'תקין',
    dot: 'bg-green-500',
    card: 'border-green-200 bg-green-50/40',
    pill: 'bg-green-50 text-green-700 border-green-200',
  },
  down: {
    label: 'למטה',
    dot: 'bg-red-500',
    card: 'border-red-300 bg-red-50/60',
    pill: 'bg-red-50 text-red-700 border-red-200',
  },
  not_configured: {
    label: 'לא מוגדר',
    dot: 'bg-amber-400',
    card: 'border-amber-200 bg-amber-50/40',
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
  },
}

const TITLES: Record<string, string> = {
  ...Object.fromEntries(PRIMARY_SERVICES.map((s) => [s.name, s.title])),
  rate_limiter: 'הגבלת קצב',
  read_replica: 'רפליקת קריאה',
  async_offload: 'עבודות רקע (Worker)',
  scheduler: 'משימות מתוזמנות',
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('he-IL', DATE_FORMAT)
}

function ServiceCard({
  service,
  dependency,
}: {
  service: PrimaryService
  dependency: DependencyReport | undefined
}) {
  // A check that is not in the report at all is reported as down, not
  // hidden: the page lists what it expects, and a missing row is a bug.
  const status: DependencyStatus = dependency?.status ?? 'down'
  const tone = TONE[status]
  return (
    <div
      data-testid="health-card"
      data-service={service.name}
      data-status={status}
      className={`rounded-xl border p-4 ${tone.card}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block size-3 rounded-full ${tone.dot}`} />
          <h2 className="text-base font-semibold text-gray-900">{service.title}</h2>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${tone.pill}`}>{tone.label}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{service.vendor}</p>
      <p className="mt-3 text-sm text-gray-700">{dependency?.detail ?? 'הבדיקה לא דיווחה'}</p>
      <p className="mt-2 text-xs text-gray-500">
        {dependency?.latencyMs === null || dependency?.latencyMs === undefined
          ? 'ללא קריאה חיצונית'
          : `${dependency.latencyMs} ms`}
      </p>
    </div>
  )
}

function IncidentRow({ incident, now }: { incident: HealthIncident; now: Date }) {
  const open = incident.resolved_at === null
  return (
    <tr data-testid="health-incident" data-open={open ? 'true' : 'false'}>
      <td className="px-4 py-3 font-medium text-gray-900">
        {TITLES[incident.dependency] ?? incident.dependency}
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            open ? TONE.down.pill : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}
        >
          {open ? 'פתוחה' : 'נסגרה'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{formatWhen(incident.started_at)}</td>
      <td className="px-4 py-3 text-gray-600">
        {incident.resolved_at ? formatWhen(incident.resolved_at) : '—'}
      </td>
      <td className="px-4 py-3 text-gray-600">
        {formatIncidentDuration(incidentMinutes(incident, now))}
      </td>
      <td className="px-4 py-3 text-gray-600">
        {incident.detail ?? '—'}
        {incident.resolved_detail ? (
          <span className="block text-xs text-gray-500">בסגירה: {incident.resolved_detail}</span>
        ) : null}
      </td>
    </tr>
  )
}

export default async function AdminHealthPage() {
  await requireSection('dashboard')
  const now = new Date()
  const [report, log] = await Promise.all([
    runHealthChecks(process.env, now),
    listIncidents(createAdminClient()),
  ])
  const byName = new Map(report.dependencies.map((d) => [d.name, d]))
  const primaryNames = new Set(PRIMARY_SERVICES.map((s) => s.name))
  const rest = report.dependencies.filter((d) => !primaryNames.has(d.name))
  const downCount = report.dependencies.filter((d) => d.status === 'down').length
  const openIncidents = log.incidents.filter((i) => i.resolved_at === null).length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">בריאות המערכת</h1>
        <p className="mt-1 text-sm text-gray-600">
          נבדק עכשיו, {formatWhen(report.checkedAt)}. הכרטיסים הם הבדיקות שרצו בבקשה הזו; הדף אינו
          נשמר במטמון.
        </p>
      </header>

      <div
        data-testid="health-summary"
        data-ok={report.ok ? 'true' : 'false'}
        className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          report.ok
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}
      >
        {report.ok
          ? 'אף שירות אינו למטה.'
          : `${downCount} שירותים אינם עונים. פירוט בכרטיסים, והתראה נשלחת מה-cron.`}
        {openIncidents > 0 ? ` ${openIncidents} תקריות פתוחות ביומן.` : ''}
      </div>

      <section aria-labelledby="health-services">
        <h2 id="health-services" className="sr-only">
          שירותים
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_SERVICES.map((service) => (
            <ServiceCard
              key={service.name}
              service={service}
              dependency={byName.get(service.name)}
            />
          ))}
        </div>
      </section>

      {rest.length > 0 ? (
        <section aria-labelledby="health-rest" className="space-y-2">
          <h2 id="health-rest" className="text-sm font-semibold text-gray-700">
            תלויות נוספות
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">תלות</th>
                  <th className="px-4 py-2 text-start font-medium">מצב</th>
                  <th className="px-4 py-2 text-start font-medium">זמן תגובה</th>
                  <th className="px-4 py-2 text-start font-medium">פירוט</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rest.map((dependency) => {
                  const tone = TONE[dependency.status]
                  return (
                    <tr
                      key={dependency.name}
                      data-testid="health-row"
                      data-status={dependency.status}
                    >
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {TITLES[dependency.name] ?? dependency.name}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${tone.pill}`}>
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {dependency.latencyMs === null ? '—' : `${dependency.latencyMs} ms`}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{dependency.detail}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="health-incidents" className="space-y-2">
        <h2 id="health-incidents" className="text-sm font-semibold text-gray-700">
          יומן תקריות
        </h2>
        {log.schemaAbsent ? (
          <p
            data-testid="incidents-pending"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            היומן עדיין לא קיים: המיגרציה 269 (<code>health_incidents</code>) ממתינה לאישור. עד
            שתוחל, ה-cron מדלג על הכתיבה והכרטיסים למעלה הם המקור היחיד.
          </p>
        ) : log.incidents.length === 0 ? (
          <p
            data-testid="incidents-empty"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600"
          >
            אין תקריות רשומות. היומן נכתב על ידי בדיקת הבריאות המתוזמנת, אחת לחמש דקות.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">שירות</th>
                  <th className="px-4 py-2 text-start font-medium">מצב</th>
                  <th className="px-4 py-2 text-start font-medium">התחלה</th>
                  <th className="px-4 py-2 text-start font-medium">סיום</th>
                  <th className="px-4 py-2 text-start font-medium">משך</th>
                  <th className="px-4 py-2 text-start font-medium">פירוט</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {log.incidents.map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-gray-500">
        &quot;לא מוגדר&quot; אינו תקלה ואינו פותח תקרית: זו התקנה שלא הושלמה, וזו עובדה אחרת. תקרית
        נפתחת רק כשבדיקת הבריאות המתוזמנת רואה שירות למטה ונסגרת בריצה הראשונה שרואה אותו עונה, ולכן
        המשכים מעוגלים למרווח של חמש דקות. מוצגות {INCIDENT_LOG_LIMIT} התקריות האחרונות. אין כאן
        Redis: הגבלת הקצב רצה ב-Postgres דרך <code>check_rate_limit</code>, ולכן היא נבדקת שם.
      </p>
    </div>
  )
}
