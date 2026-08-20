import { makeTracesSampler, serverTracesSampleRate } from '@/lib/monitoring/tracing'
import * as Sentry from '@sentry/nextjs'

/**
 * Edge runtime. src/proxy.ts runs here, which means the redirect lookup and
 * every route guard do too: a throw in the proxy takes down every request,
 * and without this it would be invisible.
 *
 * Deliberately minimal. The edge runtime has no Node APIs, so the shared
 * scrubber (which is plain JS and safe) is imported but nothing else is.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  // Same knob as the Node runtime, deliberately: the edge span and the node
  // span belong to ONE request, and two different rates would keep one end of
  // half the traces. `tracing.ts` carries the reasoning.
  tracesSampleRate: serverTracesSampleRate(),
  tracesSampler: makeTracesSampler(serverTracesSampleRate()),
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.headers) event.request.headers = {}
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
    }
    return event
  },
})
