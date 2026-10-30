import { type DependencyStatus, type HealthReport, runHealthChecks } from '@/lib/health/checks'

/**
 * Public readiness, mapped onto the five names operators actually page on.
 *
 * `/api/health` is liveness plus one database probe. This is the deeper check:
 * Postgres, the rate limiter (Postgres RPC, and Upstash when it is configured),
 * Meilisearch, R2, and Cardcom configuration. It never returns a detail string,
 *
 * WHICH OF THE FIVE ARE ACTUALLY CONTACTED, because the word "ready" implies
 * more than this route can deliver and the difference matters:
 *
 *   database     PROBED   select on `categories`
 *   redis        PROBED   Postgres RPC, plus an Upstash PING when configured
 *   meilisearch  PROBED   GET /health
 *   r2           config   four environment variables, nothing contacted
 *   cardcom      config   terminal + API name present, nothing contacted
 *
 * The last two are deliberate and `checks.ts` argues each one where it lives:
 * Cardcom has no side-effect-free endpoint, and probing R2 from an
 * UNAUTHENTICATED route would hand anyone an outbound request. But a green
 * `r2` means "four variables are set", not "storage works" - measured
 * 2026-09-08, R2 is not even enabled on this Cloudflare account.
 *
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
