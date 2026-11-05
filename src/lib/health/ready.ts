import { type DependencyStatus, type HealthReport, runHealthChecks } from '@/lib/health/checks'

/**
 * Public readiness, mapped onto the five names operators actually page on.
 *
 * `/api/health` is liveness plus one database probe. This is the deeper check:
 * Postgres, the rate limiter (Postgres RPC, and Upstash when it is configured),
 * Meilisearch, R2, and Cardcom configuration. It never returns a detail string,
 * a terminal number, or an upstream error: the route is unauthenticated, so
 * everything it says is public.
 *
 * `ok` is false, and the route 503s, only when a REQUIRED dependency is down.
 * Meilisearch is not one; see `OPTIONAL` below.
 *
 * WHY `redis` IS THE LIMITER AND NOT A SERVER THAT DOES NOT EXIST. The brief
 * names Redis. Rate limiting here is `check_rate_limit` in Postgres, with
 * Upstash as an optional faster backend. Reporting a green Redis of our own
 * would invent a dependency. The JSON key stays `redis` so a probe written
 * against the brief finds a field, and the value is the limiter's real status.
 */

export const READY_CHECK_NAMES = ['database', 'redis', 'meilisearch', 'r2', 'cardcom'] as const

export type ReadyCheckName = (typeof READY_CHECK_NAMES)[number]

/**
 * `degraded` is the honest word for search without its engine: queries are
 * answered, by Postgres, without typo tolerance, synonyms or engine facets.
 * It is neither `ok` nor an outage, so it gets a name of its own instead of
 * being folded into either.
 */
export type SearchCapability = 'ok' | 'degraded'

export type ReadyReport = {
  ok: boolean
  search: SearchCapability
  checks: Record<ReadyCheckName, DependencyStatus>
}

/**
 * The one check that cannot make the deployment unready.
 *
 * Meilisearch is optional (lib/env.ts), and when it is unset OR unreachable
 * `lib/search-server.ts` answers from Postgres behind a circuit breaker. So a
 * dead engine is a slower search box, and failing readiness over it tells a
 * load balancer to pull a shop that is taking orders. That is what production
 * did from 01.10.2026: host and key set, engine not answering, `/api/ready`
 * 503 on every probe while `/api/search` answered 200.
 *
 * Nothing is hidden by this: `checks.meilisearch` still carries the engine's
 * real status, `down` included, and `search` says what the shopper gets.
 */
const OPTIONAL: ReadonlySet<ReadyCheckName> = new Set(['meilisearch'])

const SOURCE: Record<ReadyCheckName, string> = {
  database: 'database',
  redis: 'rate_limiter',
  meilisearch: 'search',
  r2: 'storage',
  cardcom: 'cardcom',
}

export function toReadyReport(report: HealthReport): ReadyReport {
  const byName = new Map(
    report.dependencies.map((dependency) => [dependency.name, dependency.status]),
  )
  const checks = {} as Record<ReadyCheckName, DependencyStatus>
  for (const name of READY_CHECK_NAMES) {
    checks[name] = byName.get(SOURCE[name]) ?? 'down'
  }
  return {
    ok: READY_CHECK_NAMES.every((name) => OPTIONAL.has(name) || checks[name] !== 'down'),
    search: checks.meilisearch === 'ok' ? 'ok' : 'degraded',
    checks,
  }
}

export async function runReadyChecks(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<ReadyReport> {
  return toReadyReport(await runHealthChecks(env, now))
}
