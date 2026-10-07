import {
  installEarlyErrorBuffer,
  registerSentryOptions,
  routerTransitionStart,
  scheduleSentryLoad,
} from '@/lib/observability/sentry-browser'
import { sentryEnvironment } from '@/lib/observability/sentry-environment'
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub'

/**
 * Browser instrumentation. Runs after the document loads and BEFORE React
 * hydrates, which is what lets it catch an error thrown during hydration
 * itself - the class of bug that otherwise shows a blank page and reports
 * nothing.
 *
 * THE SDK IS NOT IMPORTED HERE. It is ~95 KB gzipped with tracing on, and
 * until STEP 34 it sat in the shared root chunk of every route, evaluated
 * before hydration. This file now installs a synchronous error buffer (so the
 * hydration-crash guarantee above still holds), registers the options, and
 * schedules the import for the first idle period; lib/observability/
 * sentry-browser.ts is the one loader, and every other browser caller goes
 * through it. The options object stays in this file on purpose: it is what the
 * build-config tests read, and it is the one place the browser's Sentry
 * configuration can be found.
 *
 * Next warns if this file takes longer than 16ms, so it does one thing.
 */
registerSentryOptions({
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
  // The pageload span survives the deferred init: browserTracing backfills it
  // from Navigation Timing, whose start is the document's time origin.
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

// Synchronous, before hydration: anything thrown from here on is kept and
// replayed through the SDK the moment it arrives. The first buffered error
// also triggers the import at once rather than waiting for idle.
installEarlyErrorBuffer()
scheduleSentryLoad()

/** Navigation breadcrumbs, so an error report says how the user got there. */
export const onRouterTransitionStart = routerTransitionStart
