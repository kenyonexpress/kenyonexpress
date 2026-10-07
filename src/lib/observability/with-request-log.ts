import { CacheControl } from '@/lib/cache/http'
import type { NextRequest } from 'next/server'
import { log } from './log'
import { runWithRequestContext } from './request-context'
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id'
import './request-store'

/**
 * The boundary where a route handler acquires its request id.
 *
 * `src/proxy.ts` mints the id and forwards it on the request headers, so in a
 * real request this reads rather than generates. It still falls back to minting
 * because a handler is reachable without the proxy: the matcher excludes static
 * paths today and could exclude more tomorrow, and a unit test calls the
 * exported handler directly. A correlation id that is absent exactly when
 * something unusual is happening is the wrong failure mode.
 *
 * WHY THE COMPLETION LINE IS `debug` FOR A 2xx. This wraps `/api/a`, the
 * analytics ingest, which is posted to on essentially every page view. One info
 * line per success there is a log bill and a haystack, and it says nothing that
 * the response status did not already say. 4xx warns, 5xx errors, and anything
 * the handler considers worth recording logs itself with its own event name and
 * the same request id attached.
 *
 * The handler's own behaviour is untouched: the response is returned as it came
 * back, and a throw is logged and re-thrown so `instrumentation.ts`
 * `onRequestError` still sees it and the money path still alerts.
 */
export function withRequestLog<Args extends unknown[]>(
  route: string,
  handler: (request: NextRequest, ...args: Args) => Response | Promise<Response>,
): (request: NextRequest, ...args: Args) => Promise<Response> {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    const requestId = resolveRequestId(request.headers)
    const startedAt = performance.now()

    return runWithRequestContext({ requestId, route, method: request.method }, async () => {
      try {
        const response = await handler(request, ...args)
        const durationMs = Math.round(performance.now() - startedAt)

        // Echoed so a shopper reporting "it failed" can quote a string that
        // finds the line. Guarded because a Response built from a fetch has
        // immutable headers, and a logger must not be able to break a route.
        try {
          response.headers.set(REQUEST_ID_HEADER, requestId)
          // STEP 36: a route handler that said nothing about caching is
          // per-caller. Pages get `private, no-cache, no-store` from Next the
          // moment they read a cookie; route handlers get NOTHING unless they
          // set it, and Vercel's "do not cache an unset header" is a CDN
          // default, not a browser one. A cart, a wallet pass, a supplier
          // lookup that forgot the header must never be the one a back
          // button replays after logout. Only set when absent: every public
          // route declares its own policy (lib/cache/http.ts, and the ledger
          // in __tests__/public-route-cache-control.test.ts).
          if (!response.headers.has('cache-control')) {
            response.headers.set('cache-control', CacheControl.private)
          }
        } catch {
          // Immutable headers. The id is still on every log line.
        }

        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'debug'
        log[level]('request.completed', { status: response.status, duration_ms: durationMs })

        return response
      } catch (error) {
        log.error('request.failed', {
          err: error instanceof Error ? error : new Error(String(error)),
          duration_ms: Math.round(performance.now() - startedAt),
        })
        throw error
      }
    })
  }
}
