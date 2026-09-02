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
 * WHY `redis` IS THE LIMITER AND NOT A SERVER THAT DOES NOT EXIST. The brief
 * names Redis. Rate limiting here is `check_rate_limit` in Postgres, with
 * Upstash as an optional faster backend. Reporting a green Redis of our own
 * would invent a dependency. The JSON key stays `redis` so a probe written
 * against the brief finds a field, and the value is the limiter's real status.
 */

export const READY_CHECK_NAMES = ['database', 'redis', 'meilisearch', 'r2', 'cardcom'] as const

export type ReadyCheckName = (typeof READY_CHECK_NAMES)[number]

export type ReadyReport = {
  ok: boolean
  checks: Record<ReadyCheckName, DependencyStatus>
}

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
    ok: Object.values(checks).every((status) => status !== 'down'),
    checks,
  }
}

export async function runReadyChecks(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<ReadyReport> {
  return toReadyReport(await runHealthChecks(env, now))
}
