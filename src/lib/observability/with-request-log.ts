import { captureRouteFailure } from '@/lib/monitoring/capture'
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
        } catch {
          // Immutable headers. The id is still on every log line.
        }

        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'debug'
        log[level]('request.completed', { status: response.status, duration_ms: durationMs })

        // A 5xx the handler RETURNED rather than threw.
        //
        // This is the gap `onRequestError` cannot see. It reports what escapes a
        // handler, and a handler that catches its own failure and answers
        // `{ ok: false }, { status: 500 }` never throws -- so the customer got a
        // 500 and Sentry heard nothing. Four routes did exactly that. Reporting
        // it here rather than in each of them means the guarantee covers the
        // route written next month too.
        //
        // Deliberately not 4xx: a validation failure, a 401 and a 404 are the
        // system working. They are on the log line above, where a drain can
        // count them, and an alert channel that carries them is one nobody
        // reads.
        if (response.status >= 500) {
          captureRouteFailure(`${route} responded ${response.status}`, {
            route,
            status: response.status,
            detail: { method: request.method, duration_ms: durationMs },
          })
        }

        return response
      } catch (error) {
        // Logged and re-thrown, NOT captured here. An error that escapes a
        // handler reaches `instrumentation.ts` `onRequestError`, which already
        // reports it -- with the route type and the digest, which this wrapper
        // does not have. Capturing in both places would file every uncaught
        // route error twice, and on the money path it would also mean two
        // pushes to the phone for one failure.
        log.error('request.failed', {
          err: error instanceof Error ? error : new Error(String(error)),
          duration_ms: Math.round(performance.now() - startedAt),
        })
        throw error
      }
    })
  }
}
