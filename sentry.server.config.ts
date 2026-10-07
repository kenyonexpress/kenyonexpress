import { sentryEnvironment } from '@/lib/observability/sentry-environment'
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub'
import * as Sentry from '@sentry/nextjs'

/**
 * Server runtime (Node). Loaded by instrumentation.ts register().
 *
 * Inert without SENTRY_DSN: init is skipped entirely, so tests, CI and local
 * development make no network call and need no credential.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // The platform's word first, the hand-set variable second, `local` when
  // neither. NOT `NODE_ENV`, which calls a laptop running `pnpm start`
  // "production" and files its errors beside the shop's.
  // See lib/observability/sentry-environment.ts.
  environment: sentryEnvironment({
    VERCEL_ENV: process.env.VERCEL_ENV,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  }),

  // Tied to the deployed commit so a stack trace can be read against the exact
  // source it came from. Vercel injects VERCEL_GIT_COMMIT_SHA; the local
  // fallback keeps a self-hosted build from reporting no release at all.
  // next.config.ts uploads the source maps under the SAME expression, which
  // is what makes them apply.
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

  // The single scrubber (R39, SEC-SCRUB), shared with the edge and the
  // browser so the three runtimes cannot drift apart again. Headers and
  // cookies dropped wholesale, the voucher token in /redeem/<token> and any
  // credential in a query redacted, every context and breadcrumb scrubbed by
  // key, emails and phone numbers masked in free text, and the user reduced
  // to the id. See lib/observability/sentry-scrub.ts.
  beforeSend: scrubSentryEvent,
})
