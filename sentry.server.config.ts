import { redact } from '@/lib/observability/scrub'
import { isClientDisconnect, shouldReportToSentry } from '@/lib/observability/sentry-filter'
import * as Sentry from '@sentry/nextjs'

/**
 * Server runtime (Node). Loaded by instrumentation.ts register().
 *
 * Inert without SENTRY_DSN, AND inert on a developer machine that has one.
 *
 * This block used to claim the first half alone, and read as though it covered
 * local development. It did not: `.env.local` sets SENTRY_DSN, so this laptop
 * had been reporting into the shared project all along - measured 2026-09-08,
 * 42 `The destination stream closed early` events in 41 minutes from browser
 * tests aborting RSC streams. The rule is now the environment name, checked in
 * `shouldReportToSentry`, so tests, CI and local runs stay silent while a
 * self-hosted production build still reports.
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

  // Tied to the deployed commit so a stack trace can be read against the exact
  // source it came from. Vercel injects VERCEL_GIT_COMMIT_SHA; the local
  // fallback keeps a self-hosted build from reporting no release at all.
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,

  // 10% of server requests carry a full trace.
  //
  // This was 0, on the grounds that "what is wanted is every error, not a
  // sample of every request". Errors are still all of them: tracesSampleRate
  // governs TRANSACTIONS only and has never gated captureException. What the 0
  // actually cost was the span tree hanging off an error - which query, which
  // fetch, how long each took - on a checkout whose failures are the reason
  // this file exists.
  //
  // 10% rather than 100% because a trace is billed per transaction and this
  // plan's quota is small. It is a floor, not a ceiling: an error's own event
  // is never sampled away, so the 90% that carry no trace still report.
  //
  // COUPLED TO next.config.ts. `compiler.define.__SENTRY_TRACING__` must stay
  // absent or false-y-removed; set it to `false` and the bundler shakes the
  // span code out, after which this number governs nothing and says otherwise.
  tracesSampleRate: 0.1,

  // Never. PII here would be customer emails and addresses in a third-party
  // system, and the money path already carries everything an investigation
  // needs through capturePaymentError's tagged context.
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

    // The single scrubber (R39). Headers and cookies carry the Supabase session
    // and the Cardcom shared secret, so they are dropped wholesale rather than
    // filtered key by key.
    if (event.request?.headers) event.request.headers = {}
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.url) event.request.url = redactUrl(event.request.url)
    if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>
    if (event.contexts?.payment) {
      event.contexts.payment = redact(event.contexts.payment) as Record<string, unknown>
    }
    return event
  },
})

/**
 * A voucher token lives in the PATH of /redeem/<token>, where the key-based
 * scrubber cannot see it. An error thrown on that route would otherwise put a
 * live coupon into Sentry's retained event, which is SEC-SCRUB.
 */
function redactUrl(url: string): string {
  return url
    .replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
    .replace(/([?&])(token|code|secret)=[^&]*/gi, '$1$2=[redacted]')
}
