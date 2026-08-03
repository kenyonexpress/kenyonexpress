import type { Instrumentation } from 'next'

/**
 * Server and edge instrumentation. Next 16 calls `register` once per server
 * instance, before the first request is served. This file lives in `src/`
 * because the project uses a src folder: a copy at the repository root is
 * silently ignored, not merged.
 *
 * WHAT CHANGED, AND WHY THE OLD REASONING STILL HOLDS.
 *
 * This used to forward only money-path errors, on the grounds that "an alert
 * channel that also carries catalogue render errors is one nobody reads". That
 * is correct about an ALERT CHANNEL and it is now enforced where it belongs:
 * lib/observability/alert.ts pushes to a phone, and only for money.
 *
 * Sentry is not that channel. It is a searchable record you consult when
 * something is already known to be wrong, and a record with the catalogue
 * missing is a record that cannot answer "was this only the checkout, or was
 * the whole site throwing". So capture is broad here and the interrupt stays
 * narrow.
 */
export async function register(): Promise<void> {
  // The request-id storage, before anything that might want to log.
  //
  // This is the only place a Server Function can get one from. `'use server'`
  // modules are walked by the client bundler (Turbopack emits a client chunk
  // item for the action reference), so they cannot import `node:async_hooks`
  // themselves -- lib/observability/request-context.ts carries the build error
  // that established that. Importing the store here installs it on globalThis
  // once per server instance, before the first request, and every action then
  // reaches it through the handle.
  await import('@/lib/observability/request-store')

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // First, deliberately. Environment validation exists so a misconfigured
    // deploy never becomes a request; loading it after Sentry would report the
    // failure from a process that should not have started.
    await import('@/lib/env')
    await import('../sentry.server.config')
  }

  // The edge runtime gets its own module instance. src/proxy.ts runs there, and
  // since the redirect lookup landed it is no longer true that the edge touches
  // nothing that matters: a throw there takes down every request on the site.
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

/** Paths where a failure means a customer may have been charged. */
function isMoneyPath(path: string): boolean {
  return (
    path.startsWith('/api/payments/') ||
    path.startsWith('/api/supplier/vouchers/') ||
    path.startsWith('/api/cron/expire-vouchers') ||
    path.startsWith('/checkout')
  )
}

/**
 * Every server-side error Next catches, including ones thrown inside a Server
 * Component where React has already replaced the instance; `digest` is the only
 * stable handle on those, which is why it is tagged rather than logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const rawPath = request.path ?? ''

  // A voucher token lives in the PATH of /redeem/<token>, where a key-based
  // scrubber cannot see it. Redacted before it reaches an event (SEC-SCRUB).
  const path = rawPath
    .replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
    .replace(/([?&])(token|code|secret)=[^&]*/gi, '$1$2=[redacted]')

  const digest = (error as { digest?: string }).digest

  if (isMoneyPath(rawPath)) {
    const [{ capturePaymentError }, { alertMoneyFailure }] = await Promise.all([
      import('@/lib/observability/sentry'),
      import('@/lib/observability/alert'),
    ])

    capturePaymentError(error, {
      stage: `request:${context.routeType}`,
      detail: { path, method: request.method, route: context.routePath, digest },
    })

    // The phone. Only here, and only for money.
    await alertMoneyFailure({ stage: `${context.routeType} ${path}`, error })
    return
  }

  const Sentry = await import('@sentry/nextjs')
  Sentry.withScope((scope) => {
    scope.setTag('route_type', context.routeType)
    scope.setTag('router', context.routerKind)
    scope.setTag('route_path', context.routePath)
    if (digest) scope.setTag('digest', digest)
    scope.setContext('request', { path, method: request.method })
    Sentry.captureException(error)
  })
}
