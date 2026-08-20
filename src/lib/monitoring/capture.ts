import { getRequestContext } from '@/lib/observability/request-context'
import { redact } from '@/lib/observability/scrub'
import * as Sentry from '@sentry/nextjs'

/**
 * Sentry for the API surface that is not the money path.
 *
 * WHY THIS IS NOT `capturePaymentError`. That one exists to be narrow: it tags
 * `area: payments`, it carries order/payment/voucher ids, and on the alarm
 * variant it pushes to a phone. Widening it to cover a pkpass build failure
 * would put catalogue-grade noise into the one channel that is supposed to mean
 * "a customer was charged and something went wrong". Two functions, two
 * meanings, one shared scrubber.
 *
 * WHAT WAS ACTUALLY MISSING, MEASURED BEFORE THIS FILE WAS WRITTEN. Next's
 * `onRequestError` (instrumentation.ts) reports every error that ESCAPES a
 * handler, and it is thorough. But a route that catches its own failure and
 * returns `NextResponse.json({ ok: false }, { status: 500 })` never throws, so
 * nothing escapes and nothing is reported. Four routes did exactly that
 * (search/index-job, webhooks/products, wallet/apple/[id], cron/invoices) and
 * one degraded silently with no log line at all (search/suggest). Every one of
 * them was a 500 that Sentry never heard about.
 *
 * The blanket fix lives in `with-request-log.ts`, which now reports any 5xx a
 * handler returns. This module is what it calls, and what a handler calls
 * directly when the failure is worth an event but the response is NOT a 5xx.
 */

/**
 * Read once at module load, like `observability/sentry.ts`. Without a DSN every
 * function here returns immediately, which is what keeps tests, CI and a laptop
 * free of network calls and configuration.
 */
const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

export type RouteErrorContext = {
  /** The route as written, e.g. `/api/search/suggest`. */
  route: string
  /** Where inside the handler, e.g. `enqueue` or `pkpass_build`. */
  stage?: string
  /** The status the customer actually got, when there is one. */
  status?: number
  /** Anything else worth seeing. Redacted before it leaves the process. */
  detail?: Record<string, unknown>
}

/**
 * Applies the shared tags. Split out so the exception and the message paths
 * cannot describe the same failure two different ways.
 */
function scopeFor(scope: Sentry.Scope, context: RouteErrorContext): void {
  scope.setTag('area', 'api')
  scope.setTag('route', context.route)
  if (context.stage) scope.setTag('stage', context.stage)
  if (context.status !== undefined) scope.setTag('status', String(context.status))

  // The one field that makes an event joinable to the log lines around it.
  // Null outside a request, which is the honest answer from a script or a test.
  const requestId = getRequestContext()?.requestId ?? null
  if (requestId) scope.setTag('request_id', requestId)

  scope.setContext('route', {
    route: context.route,
    stage: context.stage ?? null,
    status: context.status ?? null,
    request_id: requestId,
    ...((redact(context.detail ?? {}) as Record<string, unknown>) ?? {}),
  })
}

/**
 * An exception a route handler caught and dealt with itself.
 *
 * Never throws and never rejects: every call site is already on a failure
 * branch, and an error raised while reporting an error becomes the error the
 * customer sees.
 */
export function captureRouteError(error: unknown, context: RouteErrorContext): void {
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scopeFor(scope, context)
      scope.setLevel('error')
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    })
  } catch {
    // Reporting is best effort by definition.
  }
}

/**
 * A failure with no exception to attach: the handler decided on a 5xx from a
 * value rather than a throw (a Supabase `{ error }`, a provider replying "no").
 *
 * Reported as a message rather than a synthesised Error on purpose. A stack
 * manufactured at the point of reporting points at this file and at
 * `with-request-log.ts`, which is a stack describing the reporter rather than
 * the fault, and Sentry would then group unrelated 500s from different routes
 * together because their (identical, useless) stacks match.
 */
export function captureRouteFailure(message: string, context: RouteErrorContext): void {
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scopeFor(scope, context)
      // Grouped by route rather than by the message text, so one route flapping
      // is one issue rather than one issue per distinct 500 body.
      scope.setFingerprint(['api-failure', context.route, String(context.status ?? 500)])
      Sentry.captureMessage(message, 'error')
    })
  } catch {
    // Best effort.
  }
}
