import { sentryEnvironment } from '@/lib/observability/sentry-environment'
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub'
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

  // The NEXT_PUBLIC_ pair, because only a literal `process.env.NEXT_PUBLIC_*`
  // read is inlined into the client bundle; `VERCEL_ENV` itself reads as
  // undefined here. Vercel exposes NEXT_PUBLIC_VERCEL_ENV when system
  // variables are enabled (the default). Same precedence as the server: the
  // platform wins, the hand-set variable is the fallback, a laptop is `local`.
  environment: sentryEnvironment({
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  }),

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
  // privacy decision nobody has taken. (PostHog's replay is separate, consent
  // gated and bug-triggered: lib/analytics/replay-trigger.ts.)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  sendDefaultPii: false,

  // The same scrubber as the server and the edge. In the browser the parts
  // that earn their keep are the user (SentryUserSync sets { id } and nothing
  // else, but this is the guarantee rather than the convention), the voucher
  // token in the /redeem path, and the breadcrumbs: a fetch breadcrumb records
  // the request URL verbatim, and a console breadcrumb records whatever was
  // logged. See lib/observability/sentry-scrub.ts.
  beforeSend: scrubSentryEvent,

  // Noise that is never actionable: a browser extension throwing inside our
  // page, and the two ResizeObserver messages every Chrome build emits.
  // lib/analytics/replay-trigger.ts keeps the same list for the replay gate.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-extension:\/\//,
  ],
})

/** Navigation breadcrumbs, so an error report says how the user got there. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
