import { sentryEnvironment } from '@/lib/observability/sentry-environment'
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub'
import * as Sentry from '@sentry/nextjs'

/**
 * Edge runtime. src/proxy.ts runs here, which means the redirect lookup and
 * every route guard do too: a throw in the proxy takes down every request,
 * and without this it would be invisible.
 *
 * Deliberately minimal. The edge runtime has no Node APIs, so the two shared
 * modules it loads (the scrubber and the environment resolver) are plain
 * string work with no Node import; nothing else is pulled in.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // See sentry.server.config.ts and lib/observability/sentry-environment.ts.
  environment: sentryEnvironment({
    VERCEL_ENV: process.env.VERCEL_ENV,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  }),
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  // Matches the Node runtime. See sentry.server.config.ts for why 0.1.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // The same scrubber as the server and the browser. The edge used to carry
  // its own shorter copy, which redacted neither the query string nor
  // `extra`; that drift is the reason the scrub is one module now.
  beforeSend: scrubSentryEvent,
})
