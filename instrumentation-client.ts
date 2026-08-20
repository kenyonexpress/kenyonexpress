import { clientTracesSampleRate, makeTracesSampler } from '@/lib/monitoring/tracing'
import * as Sentry from '@sentry/nextjs'

/**
 * Browser instrumentation. Runs after the document loads and BEFORE React
 * hydrates, which is what lets it catch an error thrown during hydration
 * itself - the class of bug that otherwise shows a blank page and reports
 * nothing.
 *
 * Next warns if this file takes longer than 16ms, so it does one thing.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  /**
   * Browser traces: pageload and navigation timings, and the fetches a page
   * makes. Off unless NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE says otherwise,
   * for the volume reason set out in lib/monitoring/tracing.ts.
   *
   * This is the half of tracing that Speed Insights does not cover. Speed
   * Insights reports Web Vitals per route -- what the distribution looks like;
   * a trace says which request inside one slow session was the one that took
   * the time.
   */
  tracesSampleRate: clientTracesSampleRate(),
  tracesSampler: makeTracesSampler(clientTracesSampleRate()),
  // Session replay is off. It records the DOM, and this DOM contains addresses,
  // order contents and a voucher QR; shipping that to a third party is a
  // privacy decision nobody has taken.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  sendDefaultPii: false,

  beforeSend(event) {
    // Same rule as the server: a voucher token lives in the path.
    if (event.request?.url) {
      event.request.url = event.request.url
        .replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
        .replace(/([?&])(token|code|secret)=[^&]*/gi, '$1$2=[redacted]')
    }
    return event
  },

  // Noise that is never actionable: a browser extension throwing inside our
  // page, and the two ResizeObserver messages every Chrome build emits.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],
})

/** Navigation breadcrumbs, so an error report says how the user got there. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
