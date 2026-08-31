import { debugErrorRoutesEnabled } from '@/lib/observability/debug-error-gate'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { NextResponse, connection } from 'next/server'

/**
 * Throws on purpose, so `onRequestError` can be observed firing with
 * `routeType: 'route'`.
 *
 * Off unless SENTRY_DEBUG_ROUTES is set to the exact phrase the gate wants; see
 * src/lib/observability/debug-error-gate.ts for why it is a gate and not a
 * deleted-after-use file.
 *
 * The 404 is the right off-state, not a 403: a 403 confirms the route exists.
 *
 * The path matters. It is NOT under /api/payments/, so it takes the ordinary
 * branch of `onRequestError` and lands in Sentry only. An identical thrower
 * under the money path would also fire `alertMoneyFailure` and push to a phone,
 * which is not what a wiring test should do.
 *
 * `export const dynamic = 'force-dynamic'` does NOT work here: this project
 * sets `cacheComponents: true`, and Turbopack fails the build with "Route
 * segment config 'dynamic' is not compatible with nextConfig.cacheComponents".
 * `connection()` is the replacement, and it is needed rather than optional -
 * without it the gate is read at BUILD time, the 404 is prerendered, and
 * turning SENTRY_DEBUG_ROUTES on later would change nothing.
 */
async function handleGET(): Promise<NextResponse> {
  await connection()

  if (!debugErrorRoutesEnabled()) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  // The marker is what makes the event findable afterwards. `Date.now()` rather
  // than a fixed string so two runs are two events rather than one issue with a
  // count of 2, which cannot show whether the second run reported at all.
  throw new Error(`Sentry route-handler check: debug-route-${Date.now().toString(36)}`)
}

/**
 * Wrapped like every other route handler, and the repo asserts it: two tests in
 * src/lib/observability/log-coverage.test.ts fail on an unwrapped or bare
 * export. Worth keeping here rather than exempting - the wrapper is what mints
 * the request id, and a deliberate error with no request id is the one error
 * that cannot be correlated with its own log line.
 */
export const GET = withRequestLog('/api/debug/sentry', handleGET)
