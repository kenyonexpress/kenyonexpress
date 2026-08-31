import { redact } from '@/lib/observability/scrub'
import * as Sentry from '@sentry/nextjs'

/**
 * Server runtime (Node). Loaded by instrumentation.ts register().
 *
 * Inert without SENTRY_DSN: init is skipped entirely, so tests, CI and local
 * development make no network call and need no credential.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

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
