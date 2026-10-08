import type { DependencyReport, HealthReport } from '@/lib/health/checks'
import { log } from '@/lib/observability/log'

/**
 * The incident log behind /admin/health (STEP 67).
 *
 * WHAT AN INCIDENT IS. One row per stretch of time a dependency was `down`,
 * as seen by the five-minute health cron (`/api/cron/health`). The row opens
 * on the first run that sees the dependency down and closes on the first run
 * that sees it anything else: `ok`, or `not_configured` (a key removed while
 * the service was failing is "resolved by unplugging", which is still the
 * end of the outage and is said so in `resolved_detail`). Nothing opens on
 * `not_configured` alone, for the reason `checks.ts` gives: a deployment
 * waiting for a key is not an outage.
 *
 * WHY THE CRON WRITES AND THE PAGE ONLY READS. The admin page runs the checks
 * live, and a page that also wrote incidents would open one every time an
 * admin refreshed during an outage and close one the moment somebody looked
 * while it flapped. One writer with a fixed cadence gives the log one
 * meaning: "the cron saw this". Durations are therefore quantised to the
 * schedule, which the page says in words.
 *
 * ONE OPEN INCIDENT PER DEPENDENCY, enforced by a partial unique index in
 * 269, so two cron runs racing (Vercel retries a timed-out cron) cannot
 * open two rows for one outage: the second insert fails `unique_violation`,
 * which is logged and otherwise ignored, because the first one already said
 * what happened.
 *
 * BEFORE 269 IS APPLIED the table does not exist. The reader returns an
 * empty log with `schemaAbsent: true` so the page can say the migration is
 * pending rather than "no incidents", which would be a false green of its
 * own; the writer logs once at warn and skips. The same 42P01 / PGRST205
 * reading as `category-guides/rules.ts`.
 */

export const INCIDENTS_TABLE = 'health_incidents'

export interface HealthIncident {
  id: string
  dependency: string
  detail: string | null
  started_at: string
  resolved_at: string | null
  resolved_detail: string | null
}

export type IncidentLog = {
  incidents: HealthIncident[]
  /** True when the table is not there yet (migration 269 pending). */
  schemaAbsent: boolean
}

export type ReconcileResult =
  | { opened: string[]; resolved: string[]; skipped?: undefined }
  | { opened: []; resolved: []; skipped: 'schema_absent' | 'error'; reason?: string }

/** PostgREST / Postgres codes for "the table is not there". */
const MISSING_CODES = new Set(['42P01', 'PGRST205'])

export function isMissingIncidentsSchema(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code && MISSING_CODES.has(error.code)) return true
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '')
}

/**
 * The pure half: given what is open and what the checks say, which rows to
 * open and which to close. Exported for the test; `reconcileIncidents` is
 * this plus two queries.
 */
export function diffIncidents(
  open: ReadonlyArray<{ id: string; dependency: string }>,
  report: Pick<HealthReport, 'dependencies'>,
): {
  toOpen: DependencyReport[]
  toResolve: { id: string; dependency: string; detail: string }[]
} {
  const down = new Map(
    report.dependencies.filter((d) => d.status === 'down').map((d) => [d.name, d] as const),
  )
  const openNames = new Set(open.map((row) => row.dependency))
  const toOpen = [...down.values()].filter((d) => !openNames.has(d.name))
  const toResolve = open
    .filter((row) => !down.has(row.dependency))
    .map((row) => {
      const current = report.dependencies.find((d) => d.name === row.dependency)
      const detail = !current
        ? 'הבדיקה הוסרה מהרשימה'
        : current.status === 'not_configured'
          ? `הוסר מההגדרות: ${current.detail}`
          : current.detail
      return { id: row.id, dependency: row.dependency, detail }
    })
  return { toOpen, toResolve }
}

/**
 * The narrowest client shape this module needs. The real thing is the
 * service-role client from `lib/supabase/admin`; the test passes an object.
 * Typed loosely on purpose: the table is not in the generated types until
 * 269 is applied and the types regenerated, and `from('health_incidents' as
 * never)` on the real client collapses every builder to `never` anyway.
 */
// biome-ignore lint/suspicious/noExplicitAny: PostgREST builder for a table outside the generated types
export type IncidentsClient = { from: (table: string) => any }

let warnedAbsent = false

function noteSchemaAbsent(): void {
  if (warnedAbsent) return
  warnedAbsent = true
  log.warn('health_incidents.schema_absent', { hint: 'migration 269 not applied' })
}

/**
 * Open and close incidents from one report. Never throws: a broken incident
 * log must not take the health answer down with it, so every failure is a
 * log line and a `skipped` field for the cron's response.
 */
export async function reconcileIncidents(
  client: IncidentsClient,
  report: HealthReport,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  try {
    const { data, error } = await client
      .from(INCIDENTS_TABLE)
      .select('id, dependency')
      .is('resolved_at', null)
    if (error) {
      if (isMissingIncidentsSchema(error)) {
        noteSchemaAbsent()
        return { opened: [], resolved: [], skipped: 'schema_absent' }
      }
      log.warn('health_incidents.read_failed', { reason: error.message })
      return { opened: [], resolved: [], skipped: 'error', reason: error.message }
    }
    const open = (data ?? []) as { id: string; dependency: string }[]
    const { toOpen, toResolve } = diffIncidents(open, report)

    const opened: string[] = []
    if (toOpen.length > 0) {
      const { error: insertError } = await client.from(INCIDENTS_TABLE).insert(
        toOpen.map((d) => ({
          dependency: d.name,
          detail: d.detail,
          started_at: now.toISOString(),
        })),
      )
      if (insertError) {
        // 23505 is the partial unique index: a racing run opened it first,
        // and that row already says what this one would.
        if (insertError.code !== '23505') {
          log.warn('health_incidents.open_failed', { reason: insertError.message })
        }
      } else {
        opened.push(...toOpen.map((d) => d.name))
        log.error('health.incident_opened', { dependencies: opened })
      }
    }

    const resolved: string[] = []
    for (const row of toResolve) {
      const { error: updateError } = await client
        .from(INCIDENTS_TABLE)
        .update({ resolved_at: now.toISOString(), resolved_detail: row.detail })
        .eq('id', row.id)
        .is('resolved_at', null)
      if (updateError) {
        log.warn('health_incidents.resolve_failed', {
          dependency: row.dependency,
          reason: updateError.message,
        })
      } else {
        resolved.push(row.dependency)
      }
    }
    if (resolved.length > 0) log.info('health.incident_resolved', { dependencies: resolved })

    return { opened, resolved }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.warn('health_incidents.reconcile_threw', { reason })
    return { opened: [], resolved: [], skipped: 'error', reason }
  }
}

export const INCIDENT_LOG_LIMIT = 50

/**
 * The most recent incidents, open ones first (they have no resolved_at and
 * sort to the top by started_at desc anyway, since an open incident is the
 * newest for its dependency). Empty with `schemaAbsent` before 269.
 */
export async function listIncidents(
  client: IncidentsClient,
  limit: number = INCIDENT_LOG_LIMIT,
): Promise<IncidentLog> {
  try {
    const { data, error } = await client
      .from(INCIDENTS_TABLE)
      .select('id, dependency, detail, started_at, resolved_at, resolved_detail')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) {
      if (isMissingIncidentsSchema(error)) {
        noteSchemaAbsent()
        return { incidents: [], schemaAbsent: true }
      }
      log.warn('health_incidents.list_failed', { reason: error.message })
      return { incidents: [], schemaAbsent: false }
    }
    const rows = (data ?? []) as HealthIncident[]
    return {
      incidents: rows.filter((row) => typeof row.dependency === 'string' && row.started_at),
      schemaAbsent: false,
    }
  } catch (error) {
    log.warn('health_incidents.list_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return { incidents: [], schemaAbsent: false }
  }
}

/** Whole minutes between start and end (or now), never negative. For the page. */
export function incidentMinutes(incident: HealthIncident, now: Date = new Date()): number {
  const start = Date.parse(incident.started_at)
  const end = incident.resolved_at ? Date.parse(incident.resolved_at) : now.getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 60_000))
}

/** "N דקות" / "N שעות ו-M דקות" / "N ימים", in Hebrew, for the log column. */
export function formatIncidentDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 48) return rest === 0 ? `${hours} שעות` : `${hours} שעות ו-${rest} דקות`
  return `${Math.floor(hours / 24)} ימים`
}
