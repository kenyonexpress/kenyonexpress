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
 * WHY THE COMPLETION LINE IS `info` FOR A 2xx, EXCEPT ON THREE ROUTES. It was
 * `debug` everywhere, and the cost of `/api/a` was the reason: the analytics
 * beacon is posted to on essentially every page view, so one info line per
 * success there is a log bill and a haystack.
 *
 * MEASURED 2026-09-21: that reason is true of three routes and was being
 * charged to forty-one. `LOG_LEVEL` is set in no environment and `log.ts`
 * defaults the threshold to `info`, so a `debug` completion line is not merely
 * cheap -- it is never emitted at all. `request.completed` therefore existed in
 * production only for 4xx and 5xx, and `duration_ms` with it. A panel charting
 * p95 latency by route off this event was charting the latency of failures and
 * labelling it the latency of the site: a confident wrong number, which is
 * worse than an empty panel.
 *
 * So the cost argument keeps the routes it was actually about, by name and with
 * the volume that earns it, and every other route emits one info line per
 * request. `scripts/axiom/dashboards/routes.json` reads this event, and
 * `axiom-dashboard-contract.test.ts` fails if the two ever disagree.
 *
 * 4xx warns, 5xx errors, and anything the handler considers worth recording
 * logs itself with its own event name and the same request id attached.
 *
 * The handler's own behaviour is untouched: the response is returned as it came
 * back, and a throw is logged and re-thrown so `instrumentation.ts`
 * `onRequestError` still sees it and the money path still alerts.
 */
/**
 * Routes whose 2xx completion line stays `debug`, each because it is called far
 * more often than it is interesting. Turn the lot on with `LOG_LEVEL=debug`.
 *
 *   /api/a               analytics beacon, once per page view
 *   /api/search/suggest  typeahead, once per keystroke
 *   /api/health          liveness, polled by the synthetic probe every five
 *                        minutes and by the platform more often than that
 *
 * `high-volume-routes.test.ts` asserts each name is a route that really
 * registers a handler, so this list cannot quietly rot into silencing nothing.
 */
export const HIGH_VOLUME_ROUTES: ReadonlySet<string> = new Set([
  '/api/a',
  '/api/search/suggest',
  '/api/health',
])

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

        const settled = HIGH_VOLUME_ROUTES.has(route) ? 'debug' : 'info'
        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : settled
        log[level]('request.completed', { status: response.status, duration_ms: durationMs })

        return response
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt)
        // `redirect()` and `notFound()` inside a route handler are thrown, not
        // returned, and Next turns them into the 3xx or 404 after this catch.
        // They are the handler's answer, not its failure: the route audit of
        // 25.09 found every gated CSV export writing an error-level
        // `request.failed` with a NEXT_REDIRECT stack for each anonymous
        // visit, which is exactly the line an on-call reader would page on.
        const control = controlFlowStatus(error)
        if (control !== null) {
          log[control >= 400 ? 'warn' : 'info']('request.completed', {
            status: control,
            duration_ms: durationMs,
          })
          throw error
        }
        log.error('request.failed', {
          err: error instanceof Error ? error : new Error(String(error)),
          duration_ms: durationMs,
        })
        throw error
      }
    })
  }
}

/**
 * The status Next will send for a thrown navigation signal, or null when the
 * throw is a real failure. The digest is Next's own wire format:
 * `NEXT_REDIRECT;<type>;<url>;<status>;` and `NEXT_HTTP_ERROR_FALLBACK;<status>`.
 */
export function controlFlowStatus(error: unknown): number | null {
  const digest = (error as { digest?: unknown } | null)?.digest
  if (typeof digest !== 'string') return null
  if (digest.startsWith('NEXT_REDIRECT;')) {
    const status = Number(digest.split(';')[3])
    return Number.isInteger(status) && status >= 300 && status < 400 ? status : 307
  }
  if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;')) {
    const status = Number(digest.split(';')[1])
    return Number.isInteger(status) && status >= 400 && status < 500 ? status : 404
  }
  return null
}
