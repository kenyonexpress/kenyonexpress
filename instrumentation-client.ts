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
  // NEXT_PUBLIC_SENTRY_RELEASE first, then the SHA Vercel exposes to the
  // browser. The fallback is what makes the uploaded source maps usable on a
  // Vercel deploy without a hand-set variable: the maps are attached to the
  // commit sha, and a client that reports no release (or a different one) gets
  // its stack traces left minified with nothing saying why. The plain
  // VERCEL_GIT_COMMIT_SHA cannot be used here - without the NEXT_PUBLIC_
  // prefix it is not inlined into the client bundle and reads as undefined.
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Matches the server, so one page view and the request it makes land in the
  // same trace rather than two unrelated halves. See sentry.server.config.ts.
  tracesSampleRate: 0.1,

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
