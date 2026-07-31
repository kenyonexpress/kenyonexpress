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

  // Off. Tracing is high-volume by nature and this project is one operator with
  // a phone: what is wanted is every error, not a sample of every request.
  tracesSampleRate: 0,

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
