import type { Instrumentation } from 'next'

/**
 * Server instrumentation (Next 16 file convention: `register` runs once per
 * server instance, before the first request is served).
 *
 * Sentry is initialised here rather than through `withSentryConfig` in
 * next.config, because the payment path this exists for is entirely
 * server-side. The config wrapper's job is client bundling and source-map
 * upload, neither of which is needed to alert on a charge that failed to
 * settle, and both of which change how the whole app builds.
 *
 * Everything below is inert without SENTRY_DSN.
 */
export async function register(): Promise<void> {
  // The Edge runtime gets its own module instance; the proxy runs there and
  // touches no money, so only the Node runtime is wired up.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { initSentry } = await import('@/lib/observability/sentry')
  initSentry()
}

/**
 * Server errors Next caught for us. Only the money path is forwarded: an alert
 * channel that also carries catalogue render errors is one nobody reads, and
 * the whole point of this one is that an event in it always means a customer
 * may have been charged.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const path = request.path ?? ''
  const onMoneyPath =
    path.startsWith('/api/payments/') ||
    path.startsWith('/api/supplier/vouchers/') ||
    path.startsWith('/api/cron/expire-vouchers') ||
    path.startsWith('/checkout')

  if (!onMoneyPath) return

  const { capturePaymentError } = await import('@/lib/observability/sentry')
  capturePaymentError(error, {
    stage: `request:${context.routeType}`,
    detail: {
      path,
      method: request.method,
      route: context.routePath,
      // `digest` is Next's id for the error the client saw; it is what ties a
      // customer's "something went wrong" screenshot to this event.
      digest: (error as { digest?: string }).digest,
    },
  })
}
