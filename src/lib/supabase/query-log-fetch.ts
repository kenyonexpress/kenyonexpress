import { log } from '@/lib/observability/log'
import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
import { SupabaseTimeoutError } from '@/lib/supabase/timeout-fetch'

/**
 * Query logs, from the one place every Supabase call passes through.
 *
 * WHY HERE AND NOT AT THE CALL SITES. Same argument as timeout-fetch.ts and
 * rls-report-fetch.ts: hundreds of reads and writes, seven client factories,
 * and the next call site anyone adds must not be the one that forgot. This
 * wrapper sits under rls-report-fetch and over request-id-fetch, so the
 * duration it measures includes the timeout layer and the network -- what the
 * caller actually waited -- and the RLS reporter above it still sees the
 * final response.
 *
 * WHAT EACH OUTCOME COSTS IN LOG VOLUME, because that is the design problem.
 * A healthy query per line at the default threshold would out-shout every
 * other event this codebase emits (the same measurement that made
 * withRequestLog log a 2xx at debug). So:
 *
 * - success and 4xx:  `db.query` at DEBUG. Free in production until someone
 *   sets LOG_LEVEL=debug to turn full query logging on; 4xx stays here
 *   because PostgREST answers 406 for a `.single()` miss and 409 for a
 *   conflict the caller handles -- routine answers, not failures. RLS
 *   denials among them are already reported loudly by rls-report-fetch.
 * - slow success:     `db.query_slow` at WARN. Slowness is invisible at the
 *   call site (the query still succeeds) and is exactly what a dashboard
 *   should chart before it becomes a timeout.
 * - 5xx:              `db.query_failed` at ERROR. The database answered
 *   "broken"; some call sites treat that as "not found" and move on, which
 *   is how an outage hides behind empty pages.
 * - a throw:          `db.query_failed` at ERROR, then rethrown untouched.
 *   Except SupabaseTimeoutError, which timeout-fetch already logged as
 *   `supabase.timeout`; logging it twice under two names would make the
 *   dashboards double-count the incident.
 *
 * The URL's query string appears in no event, ever: a PostgREST filter like
 * ?email=eq.someone@x.com is PII, the target is not (SEC-SCRUB, and the same
 * line rls-report-fetch draws).
 */

/**
 * The call's target: `orders` for a table read, `rpc:close_order` for a
 * function, `auth:token` for a GoTrue call. Auth is included because a spike
 * of failing token calls is the first line of the auth dashboard, and GoTrue
 * traffic goes through the same injected fetch. Anything unrecognized
 * (storage, realtime) returns null and passes through unlogged.
 */
export function supabaseTarget(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
  let pathname: string
  try {
    pathname = new URL(raw).pathname
  } catch {
    return null
  }
  const rest = pathname.match(/\/rest\/v1\/(rpc\/)?([^/?#]+)/)
  if (rest?.[2]) return rest[1] ? `rpc:${rest[2]}` : rest[2]
  const auth = pathname.match(/\/auth\/v1\/([^/?#]+)/)
  if (auth?.[1]) return `auth:${auth[1]}`
  return null
}

/**
 * Read per call, like supabaseTimeoutMs and for the same reason. 1500ms is
 * several times a healthy query from a Vercel region to Supabase and well
 * under the 10s timeout, so the warn fires while there is still something to
 * fix rather than an incident to explain.
 */
export function slowQueryMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.SUPABASE_SLOW_QUERY_MS)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1_500
}

/**
 * `fetch` that logs every PostgREST and GoTrue call. Exported as a factory so
 * a test can inject its own `fetch`, matching the other wrappers here.
 */
export function createQueryLogFetch(
  baseFetch: typeof fetch = requestIdFetch,
  env: NodeJS.ProcessEnv = process.env,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = supabaseTarget(input)
    if (!target) return baseFetch(input, init)

    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const startedAt = performance.now()

    try {
      const response = await baseFetch(input, init)
      const durationMs = Math.round(performance.now() - startedAt)
      const thresholdMs = slowQueryMs(env)

      if (response.status >= 500) {
        log.error('db.query_failed', {
          target,
          method,
          status: response.status,
          duration_ms: durationMs,
        })
      } else if (durationMs >= thresholdMs) {
        log.warn('db.query_slow', {
          target,
          method,
          status: response.status,
          duration_ms: durationMs,
          threshold_ms: thresholdMs,
        })
      } else {
        log.debug('db.query', { target, method, status: response.status, duration_ms: durationMs })
      }
      return response
    } catch (error) {
      // supabase.timeout already logged this one with the same duration.
      if (!(error instanceof SupabaseTimeoutError)) {
        log.error('db.query_failed', {
          target,
          method,
          duration_ms: Math.round(performance.now() - startedAt),
          err: error instanceof Error ? error : new Error(String(error)),
        })
      }
      throw error
    }
  }
}

/** The shared instance, under rls-report-fetch and over request-id-fetch. */
export const queryLogFetch: typeof fetch = createQueryLogFetch()
