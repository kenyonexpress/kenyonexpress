import { isClientDisconnect, shouldReportToSentry } from '@/lib/observability/sentry-filter'
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

  /**
   * WHO IS ALLOWED TO REPORT, decided before init rather than inside beforeSend.
   *
   * `enabled` is false on a developer machine unless SENTRY_ALLOW_LOCAL=true. The
   * header above says this file is "inert without SENTRY_DSN ... local
   * development makes no network call", and that is true only while the DSN is
   * unset - .env.local sets it, and on 2026-09-08 this laptop put 42 stream
   * aborts into the money-path project in 41 minutes. A self-hosted PRODUCTION
   * build still reports: the test is the environment name, not the presence of
   * Vercel.
   */
  enabled: shouldReportToSentry({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    allowLocal: process.env.SENTRY_ALLOW_LOCAL,
  }),
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  // Matches the Node runtime. See sentry.server.config.ts for why 0.1.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) {
    // A CLIENT THAT WENT AWAY IS NOT AN ERROR AT THIS END.
    //
    // A visitor who navigates mid-stream, closes the tab, or loses signal makes
    // Next's app-page runtime throw "The destination stream closed early" from
    // a PassThrough. Nothing is broken and nobody can act on it. Dropped by
    // exact message so a genuinely new streaming failure still reports.
    //
    // This one is not hypothetical in production: it is what a back button
    // during a streamed render looks like, and it arrived here at 42 events in
    // 41 minutes from a single laptop running browser tests.
    if (isClientDisconnect(event.exception?.values?.[0]?.value)) return null

    if (event.request?.headers) event.request.headers = {}
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
    }
    return event
  },
})
