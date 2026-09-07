import { log } from '@/lib/observability/log'
import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
import * as Sentry from '@sentry/nextjs'

/**
 * RLS denials, reported from the one place every Supabase call passes through.
 *
 * WHY HERE AND NOT AT THE CALL SITES. Same argument as timeout-fetch.ts: there
 * are hundreds of Supabase reads and writes and seven places a client is
 * built. supabase-js does not throw on an RLS denial, it resolves with
 * `{ data: null, error }`, and most call sites treat that as "not found" and
 * move on. A policy regression therefore does not crash anything -- it shows
 * up as customers quietly seeing empty pages, or worse, as a probe quietly
 * being told "permission denied" while nobody is counting the attempts. The
 * fetch layer is the only spot that sees every denial without asking 84 call
 * sites to remember to check `error.code`.
 *
 * WHAT COUNTS AS A DENIAL. PostgREST surfaces RLS and grant failures as
 * Postgres error 42501 ("insufficient_privilege"), and a new-row policy
 * violation names row-level security in the message. Anything else -- bad
 * filter, missing column, JWT expiry -- is a different failure with a
 * different owner and stays out of this channel.
 *
 * The response is returned untouched either way: reporting reads a clone, and
 * a failure inside the reporting never becomes the caller's failure.
 */

/** The PostgREST target: `orders` for a table read, `rpc:close_order` for a function. */
function restTarget(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
  let pathname: string
  try {
    pathname = new URL(raw).pathname
  } catch {
    return null
  }
  const match = pathname.match(/\/rest\/v1\/(rpc\/)?([^/?#]+)/)
  if (!match?.[2]) return null
  return match[1] ? `rpc:${match[2]}` : match[2]
}

function isRlsDenialBody(body: unknown): body is { code?: string; message?: string } {
  if (typeof body !== 'object' || body === null) return false
  const { code, message } = body as { code?: unknown; message?: unknown }
  if (code === '42501') return true
  return typeof message === 'string' && /row.level security/i.test(message)
}

/**
 * `fetch` that reports RLS denials to Sentry before handing the response back.
 *
 * Exported as a factory so a test can inject its own `fetch`, matching the
 * other two wrappers in this directory.
 */
export function createRlsReportFetch(baseFetch: typeof fetch = requestIdFetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await baseFetch(input, init)

    // 401/403 is where PostgREST puts a permission failure; 400 is where a
    // 42501 from inside an RPC lands. Everything else is not this problem.
    if (response.ok || response.status > 403) return response

    const target = restTarget(input)
    if (!target) return response

    try {
      const body: unknown = await response.clone().json()
      if (!isRlsDenialBody(body)) return response

      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      // The URL's query string is deliberately absent everywhere below: a
      // PostgREST filter like ?email=eq.someone@x.com is PII, the target is not.
      log.error('supabase.rls_denied', { target, method, status: response.status })

      // Inert without a DSN, like every capture in lib/observability/sentry.ts.
      if (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.withScope((scope) => {
          scope.setTag('area', 'rls')
          scope.setTag('rls_target', target)
          // One issue per (method, target) pair, not one per request: the
          // useful question is "which query is being denied", and the default
          // message grouping would answer it with a thousand duplicates.
          scope.setFingerprint(['rls-denial', method, target])
          scope.setContext('rls', {
            target,
            method,
            status: response.status,
            code: (body as { code?: string }).code ?? null,
            message: String((body as { message?: string }).message ?? '').slice(0, 300),
          })
          Sentry.captureMessage(`RLS denied: ${method} ${target}`, 'error')
        })
      }
    } catch {
      // A body that is not JSON, or a capture that failed. The caller's
      // request already has its answer; reporting is best effort.
    }
    return response
  }
}

/** The shared instance, outermost over request-id and timeout: it must see the final response. */
export const rlsReportFetch: typeof fetch = createRlsReportFetch()
