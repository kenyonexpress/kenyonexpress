import { configureSentry, loadSentry, sentryIfLoaded } from '@/lib/observability/sentry-client'
import { scrubEventUser } from '@/lib/observability/sentry-user'

/**
 * Browser instrumentation. Runs after the document loads and BEFORE React
 * hydrates, which is what lets it catch an error thrown during hydration
 * itself - the class of bug that otherwise shows a blank page and reports
 * nothing.
 *
 * The SDK itself is NOT imported here (C183): a static import put ~45 KB gz
 * of Sentry on every first load. This file registers the options, buffers any
 * error thrown before the SDK arrives (React 19 reports recoverable hydration
 * errors through reportError, so they land on these same window events), and
 * loads the SDK when the browser is idle after `load`, or at once on the first
 * error. The buffer is replayed after init, then the listeners are removed and
 * Sentry's own global handlers take over.
 *
 * Next warns if this file takes longer than 16ms, so it does one thing.
 */
configureSentry({
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
  tracesSampleRate: 1.0,

  // Session replay is off. It records the DOM, and this DOM contains addresses,
  // order contents and a voucher QR; shipping that to a third party is a
  // privacy decision nobody has taken.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  sendDefaultPii: false,

  beforeSend(event) {
    // SentryUserSync sets { id } and nothing else, but this is the guarantee
    // rather than the convention: whatever reaches setUser, only the id ships.
    event.user = scrubEventUser(event.user)
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

const early: unknown[] = []
const onError = (event: ErrorEvent) => {
  early.push(event.error ?? event.message)
  start()
}
const onRejection = (event: PromiseRejectionEvent) => {
  early.push(event.reason)
  start()
}
window.addEventListener('error', onError)
window.addEventListener('unhandledrejection', onRejection)

let started = false
function start() {
  if (started) return
  started = true
  void loadSentry().then((Sentry) => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    for (const error of early.splice(0)) Sentry.captureException(error)
  })
}

const whenIdle = () =>
  typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback(start, { timeout: 2000 })
    : window.setTimeout(start, 0)
if (document.readyState === 'complete') whenIdle()
else window.addEventListener('load', whenIdle, { once: true })

/**
 * Navigation breadcrumbs, so an error report says how the user got there.
 * A navigation before the SDK has loaded has no trace to join yet.
 */
export function onRouterTransitionStart(
  href: string,
  navigationType: 'push' | 'replace' | 'traverse',
) {
  sentryIfLoaded()?.captureRouterTransitionStart(href, navigationType)
}
