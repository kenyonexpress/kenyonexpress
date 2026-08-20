import { command, upstashConfig } from '@/lib/rate-limit/upstash'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What this deployment depends on, and whether each one is actually there.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE: a check that reports green for a
 * service nobody configured is worse than no check. It converts "we never set
 * this up" into "it works", and the first time anyone finds out is when a
 * customer does. So a dependency has THREE states, not two, and
 * `not_configured` is never counted as healthy and never pages anybody.
 *
 * WHAT IS ACTUALLY HERE, MEASURED BEFORE THIS FILE WAS WRITTEN
 *
 * The brief names "DB, Redis, Meilisearch, Cardcom sandbox". **There is no
 * Redis.** Grepping the whole of `src` for `UPSTASH`, `redis` or `Redis`
 * returns nothing: rate limiting is `check_rate_limit` / `check_user_rate_limit`,
 * two Postgres RPCs called through `lib/utils/rate-limit.ts`, and the counters
 * live in the `rate_limits` and `user_rate_limits` tables. [50]'s brief said
 * Upstash too; the code has never used it. Reporting a green Redis here would
 * be reporting on a dependency that does not exist, so the rate limiter is
 * checked where it actually runs - in the database.
 *
 * WHY CARDCOM IS CONFIGURATION-ONLY
 *
 * Cardcom's interface has no unauthenticated no-op. Every endpoint this client
 * speaks to either creates a Low Profile page, charges, credits or looks up a
 * deal - so a five-minute liveness probe against it would either create a
 * garbage deal every five minutes or authenticate with real credentials against
 * a real terminal on a schedule. Neither is a health check; both are traffic.
 * What can be checked without side effects is whether the terminal and API name
 * are set at all, which is exactly the GO/NO-GO item that is open today.
 */

export type DependencyStatus = 'ok' | 'down' | 'not_configured'

export interface DependencyReport {
  /** Stable machine name; the admin screen and the alert both key on it. */
  name: string
  status: DependencyStatus
  /** Round-trip in whole milliseconds, when something was actually called. */
  latencyMs: number | null
  /** One short line for a human. Never an upstream error string verbatim. */
  detail: string
}

export interface HealthReport {
  ok: boolean
  checkedAt: string
  dependencies: DependencyReport[]
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number }> {
  const start = performance.now()
  try {
    const value = await fn()
    return { value, ms: Math.round(performance.now() - start) }
  } catch {
    return { value: null, ms: Math.round(performance.now() - start) }
  }
}

/**
 * Postgres, through the service client.
 *
 * A HEAD count on `categories`: a table that always has rows, is off the money
 * path, and returns no rows over the wire. Through the ADMIN client on purpose -
 * an anon read would be measuring RLS as much as reachability, and a policy
 * change would then look like an outage.
 */
async function checkDatabase(): Promise<DependencyReport> {
  const { value, ms } = await timed(async () => {
    const { error } = await createAdminClient()
      .from('categories')
      .select('id', { count: 'exact', head: true })
    return error ? 'down' : 'ok'
  })
  const status: DependencyStatus = value === 'ok' ? 'ok' : 'down'
  return {
    name: 'database',
    status,
    latencyMs: ms,
    detail: status === 'ok' ? 'Supabase Postgres' : 'שאילתת בדיקה נכשלה',
  }
}

/**
 * The rate limiter, both backends, reported as one dependency.
 *
 * The Postgres RPC is probed with a key of its own and a limit high enough that
 * the probe can never be what exhausts it. A missing function (fresh database,
 * unapplied migration) is `down` rather than `not_configured`: unlike an unset
 * API key, this one is supposed to be there, and the limiter FAILS OPEN when
 * the RPC errors - so a broken limiter is an open endpoint, silently.
 *
 * WHY AN UNREACHABLE UPSTASH IS NOT `down`, AND WHERE IT SHOWS UP INSTEAD.
 * `runHealthChecks` sets `ok: false` for any `down`, and `buildHealthAlert`
 * pages for it. Upstash being unreachable while Postgres answers means the
 * limits are STILL BEING ENFORCED, just by the slower backend - paging for that
 * is a false page, and an alert that cries wolf costs the alerts that matter.
 * The degradation is not silent, though: the detail below names it on the admin
 * status screen, and `rate_limit.upstash_failed` is logged on every request
 * that pays the fallback.
 */
async function checkRateLimiter(env: NodeJS.ProcessEnv): Promise<DependencyReport> {
  const { value, ms } = await timed(async () => {
    const [postgres, upstash] = await Promise.all([probePostgresLimiter(), probeUpstash(env)])
    return { postgres, upstash }
  })

  // `timed` reports a thrown callback as `null`. Neither probe throws - each
  // returns its own failure value - so null here can only mean the timing
  // wrapper itself did, and treating that as "both backends unknown" is the
  // conservative read.
  const postgres = value?.postgres ?? false
  const upstash = value?.upstash ?? 'not_configured'
  const status: DependencyStatus = postgres || upstash === 'ok' ? 'ok' : 'down'

  return {
    name: 'rate_limiter',
    status,
    latencyMs: ms,
    detail: rateLimiterDetail(postgres, upstash),
  }
}

function rateLimiterDetail(postgres: boolean, upstash: 'ok' | 'down' | 'not_configured'): string {
  if (upstash === 'ok') return 'Upstash sliding window, עם Postgres כגיבוי'
  if (upstash === 'down') {
    return postgres
      ? 'Upstash לא נענה; הלימיטים נאכפים דרך Postgres, ואיטי יותר'
      : 'שני הבקאנדים למטה, וכל המסלולים נכשלים פתוח'
  }
  return postgres
    ? 'check_rate_limit (Postgres); Upstash לא מוגדר'
    : 'ה-RPC של הרייט-לימיט לא זמין, והמסלולים נכשלים פתוח'
}

async function probePostgresLimiter(): Promise<boolean> {
  try {
    const { error } = await createAdminClient().rpc(
      'check_rate_limit' as never,
      {
        p_key: 'health:probe',
        p_max_attempts: 1_000_000,
        p_window_seconds: 60,
      } as never,
    )
    return !error
  } catch {
    // `createAdminClient` throws when the service key is absent, which is the
    // same outcome for this report as an RPC that refuses.
    return false
  }
}

/**
 * `PING`, not the limiter script. The probe must not write a counter, and it
 * must not be able to refuse: a health check that consumes budget is a health
 * check that eventually reports the outage it caused.
 */
async function probeUpstash(env: NodeJS.ProcessEnv): Promise<'ok' | 'down' | 'not_configured'> {
  const config = upstashConfig(env)
  if (!config) return 'not_configured'
  try {
    return (await command(config, ['PING'])) === 'PONG' ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

/** Meilisearch, if it is configured at all. Search falls back to Postgres when not. */
async function checkSearch(env: NodeJS.ProcessEnv): Promise<DependencyReport> {
  const host = env.MEILISEARCH_HOST
  const key = env.MEILISEARCH_API_KEY
  if (!host || !key) {
    return {
      name: 'search',
      status: 'not_configured',
      latencyMs: null,
      detail: 'Meilisearch לא מוגדר; החיפוש עובר דרך Postgres',
    }
  }
  const { value, ms } = await timed(async () => {
    const response = await fetch(`${host.replace(/\/$/, '')}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    return response.ok ? 'ok' : 'down'
  })
  const status: DependencyStatus = value === 'ok' ? 'ok' : 'down'
  return {
    name: 'search',
    status,
    latencyMs: ms,
    detail: status === 'ok' ? 'Meilisearch' : 'Meilisearch מוגדר אך אינו עונה',
  }
}

/** Configuration-only. See the header for why nothing is called. */
function checkCardcom(env: NodeJS.ProcessEnv): DependencyReport {
  const configured = Boolean(env.CARDCOM_TERMINAL_NUMBER && env.CARDCOM_API_NAME)
  return {
    name: 'cardcom',
    status: configured ? 'ok' : 'not_configured',
    latencyMs: null,
    detail: configured
      ? `מסוף ${env.CARDCOM_TERMINAL_NUMBER === '1000' ? 'סנדבוקס' : 'חי'} מוגדר`
      : 'אין מפתחות Cardcom; אין סליקה ואין הנפקת חשבוניות',
  }
}

/** Email delivery. Without it the outbox drains into nothing. */
function checkEmail(env: NodeJS.ProcessEnv): DependencyReport {
  const configured = Boolean(env.RESEND_API_KEY)
  return {
    name: 'email',
    status: configured ? 'ok' : 'not_configured',
    latencyMs: null,
    detail: configured ? 'Resend מוגדר' : 'אין מפתח Resend; אף מייל לא יישלח',
  }
}

/** Object storage for the image pipeline and the invoice PDFs. */
function checkStorage(env: NodeJS.ProcessEnv): DependencyReport {
  const configured = Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  )
  return {
    name: 'storage',
    status: configured ? 'ok' : 'not_configured',
    latencyMs: null,
    detail: configured ? 'Cloudflare R2' : 'R2 לא מוגדר; נופלים ל-Supabase Storage',
  }
}

/** The cron secret. Without it every scheduled job answers 401 and nothing runs. */
function checkScheduler(env: NodeJS.ProcessEnv): DependencyReport {
  const configured = Boolean(env.CRON_SECRET)
  return {
    name: 'scheduler',
    status: configured ? 'ok' : 'not_configured',
    latencyMs: null,
    detail: configured
      ? 'CRON_SECRET מוגדר'
      : 'אין CRON_SECRET; כל ה-cron מחזיר 401 ואף תור לא מתנקז',
  }
}

/**
 * Every check, run concurrently.
 *
 * `ok` is true when nothing is `down`. An unconfigured dependency does not make
 * the system unhealthy - it is a deployment that has not been finished, which is
 * a different fact and is reported as one.
 */
export async function runHealthChecks(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<HealthReport> {
  const dependencies = await Promise.all([
    checkDatabase(),
    checkRateLimiter(env),
    checkSearch(env),
    Promise.resolve(checkCardcom(env)),
    Promise.resolve(checkEmail(env)),
    Promise.resolve(checkStorage(env)),
    Promise.resolve(checkScheduler(env)),
  ])

  return {
    ok: dependencies.every((dependency) => dependency.status !== 'down'),
    checkedAt: now.toISOString(),
    dependencies,
  }
}

/**
 * The alert, or nothing.
 *
 * Only `down` pages. An unconfigured service would otherwise page every five
 * minutes forever on a deployment that is waiting for a key - and an alert that
 * always fires is an alert nobody reads, which costs the alerts that matter.
 */
export function buildHealthAlert(report: HealthReport): string | null {
  const down = report.dependencies.filter((dependency) => dependency.status === 'down')
  if (down.length === 0) return null
  const names = down.map((dependency) => `${dependency.name} (${dependency.detail})`).join(', ')
  return `KenyonExpress: ${down.length} תלויות למטה - ${names}`
}
