import type { DependencyStatus } from '@/lib/health/checks'
import type { ReadyCheckName, ReadyReport } from '@/lib/health/ready'

/**
 * The PUBLIC face of the health checks (UX26, 15.10.2026): what the 500 page
 * and `/status` show a shopper, read from the two unauthenticated routes.
 *
 * CLIENT-SAFE BY CONSTRUCTION. `lib/health/checks.ts` runs the probes and
 * pulls the admin client, Meilisearch and R2 into whatever imports it; this
 * module imports only TYPES from there, so it can ride in the client bundle of
 * an error boundary without dragging a server module along. The names come
 * from `READY_CHECK_NAMES` through the type, so a check renamed there is a
 * type error here, not a card that silently renders "down".
 *
 * TWO ROUTES, TWO JOBS. `/api/health` is liveness plus one database probe and
 * answers in one round trip: that is what the error page asks, because a
 * shopper on a broken page wants one sentence ("is it just this page?"), not a
 * table. `/api/ready` is the five-service readiness report: that is what the
 * status page shows, because a person who opened a status page came for the
 * table. Both are `no-store` on the server; the fetches say so too.
 *
 * FOUR STATES, NOT A BOOLEAN. `unknown` is the network failing before the
 * server answered (offline, a proxy page, a timeout), and it must not read as
 * "the site is down": the one thing a client-side probe cannot tell apart is
 * "the server is down" from "I cannot reach the server", so the copy for it
 * says exactly that and no more.
 */

export type HealthState = 'checking' | 'ok' | 'degraded' | 'unknown'

export const HEALTH_ENDPOINT = '/api/health'
export const READY_ENDPOINT = '/api/ready'
export const STATUS_PATH = '/status'

/** How long the error page waits for the health answer before saying "unknown". */
export const HEALTH_PROBE_TIMEOUT_MS = 8_000

/** The one-sentence verdict under the 500 heading, per state. */
export const HEALTH_COPY: Record<HealthState, string> = {
  checking: 'בודקים את מצב המערכת…',
  ok: 'המערכת פעילה. נראה שזו תקלה נקודתית בדף הזה, ונסיון נוסף בדרך כלל מסדר אותה.',
  degraded: 'יש אצלנו תקלה כללית ואנחנו כבר מטפלים בה. נסו שוב בעוד כמה דקות.',
  unknown: 'לא הצלחנו לבדוק את מצב המערכת כרגע. בדקו את החיבור ונסו שוב.',
}

/** The headline of the status page, per state. */
export const READY_COPY: Record<HealthState, string> = {
  checking: 'בודקים את כל השירותים…',
  ok: 'כל השירותים פעילים',
  degraded: 'יש תקלה באחד השירותים',
  unknown: 'לא הצלחנו לבדוק את מצב השירותים',
}

/** The public names of the five readiness checks, in the order the page lists them. */
export const READY_CHECK_LABELS: Record<ReadyCheckName, string> = {
  database: 'מסד הנתונים',
  redis: 'הגבלת קצב',
  meilisearch: 'חיפוש',
  r2: 'תמונות וקבצים',
  cardcom: 'סליקה',
}

export const DEPENDENCY_COPY: Record<DependencyStatus, string> = {
  ok: 'פעיל',
  down: 'תקלה',
  not_configured: 'לא מופעל',
}

export type ReadyCheck = { name: ReadyCheckName; label: string; status: DependencyStatus }

export type ReadySnapshot = {
  state: HealthState
  checks: ReadyCheck[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDependencyStatus(value: unknown): value is DependencyStatus {
  return value === 'ok' || value === 'down' || value === 'not_configured'
}

/**
 * `/api/health` to a state. The route answers 200 `{ ok: true }` or 503
 * `{ ok: false }`; anything else (an HTML challenge page, a gateway error, a
 * body that is not JSON) is `unknown`, never `degraded`.
 */
export function healthStateFrom(status: number, body: unknown): HealthState {
  if (!isRecord(body) || typeof body.ok !== 'boolean') return 'unknown'
  if (status === 200 && body.ok) return 'ok'
  if (status === 503 && !body.ok) return 'degraded'
  return 'unknown'
}

/** `/api/ready` to a state and the five labelled checks, in the page's order. */
export function readySnapshotFrom(status: number, body: unknown): ReadySnapshot {
  if (!isRecord(body) || typeof body.ok !== 'boolean' || !isRecord(body.checks)) {
    return { state: 'unknown', checks: [] }
  }
  const raw = body.checks
  const checks: ReadyCheck[] = (Object.keys(READY_CHECK_LABELS) as ReadyCheckName[]).map(
    (name) => ({
      name,
      label: READY_CHECK_LABELS[name],
      status: isDependencyStatus(raw[name]) ? raw[name] : 'down',
    }),
  )
  const state: HealthState =
    status === 200 && body.ok ? 'ok' : status === 503 && !body.ok ? 'degraded' : 'unknown'
  return { state, checks }
}

type Fetch = typeof fetch

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** One round trip to `/api/health`; never throws, never caches. */
export async function probeHealth(
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<HealthState> {
  try {
    const response = await fetchImpl(HEALTH_ENDPOINT, { cache: 'no-store', signal })
    return healthStateFrom(response.status, await readJson(response))
  } catch {
    return 'unknown'
  }
}

/** One round trip to `/api/ready`; never throws, never caches. */
export async function probeReady(
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<ReadySnapshot> {
  try {
    const response = await fetchImpl(READY_ENDPOINT, { cache: 'no-store', signal })
    return readySnapshotFrom(response.status, await readJson(response))
  } catch {
    return { state: 'unknown', checks: [] }
  }
}

/** A readiness report in the shape the route sends, for tests and fixtures. */
export function readyReportFixture(
  overrides: Partial<Record<ReadyCheckName, DependencyStatus>> = {},
): ReadyReport {
  const checks = {
    database: 'ok',
    redis: 'ok',
    meilisearch: 'ok',
    r2: 'ok',
    cardcom: 'ok',
    ...overrides,
  } satisfies ReadyReport['checks']
  return { ok: Object.values(checks).every((status) => status !== 'down'), checks }
}
