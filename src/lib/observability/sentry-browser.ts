/**
 * The browser Sentry SDK, loaded off the critical path.
 *
 * WHY THIS FILE EXISTS. `instrumentation-client.ts` used to `import * as
 * Sentry from '@sentry/nextjs'` and call `Sentry.init()` synchronously, and
 * `error.tsx`, `global-error.tsx` and `SentryUserSync` imported the same
 * package statically. Measured on the 2026-10-07 build
 * (`node scripts/route-js-report.mjs`): the SDK with tracing was 311 KB of the
 * 698 KB shared root JS, ~95 KB gzipped, parsed and evaluated on EVERY route
 * before React hydrated. Nothing in it is needed until something goes wrong,
 * and when something goes wrong a one-off dynamic import is fast enough.
 *
 * WHAT IS KEPT. Every error that happens before the SDK arrives is still
 * reported. `installEarlyErrorBuffer()` is installed synchronously by
 * `instrumentation-client.ts` (which Next runs before hydration), so a
 * hydration crash, an uncaught exception or an unhandled rejection in the
 * first seconds is buffered, triggers the import immediately, and is replayed
 * through `captureException` the moment `init()` returns. React boundaries
 * (`error.tsx`) go through `withSentry()`, which loads on demand. The pageload
 * span is unaffected by the late `init`: browserTracing backfills it from the
 * Navigation Timing entry, whose start is the document's time origin.
 *
 * WHAT IS LOST, ON PURPOSE. Breadcrumbs (clicks, fetches, console) from the
 * seconds before the SDK loaded. The alternative was ~95 KB gzipped on every
 * first paint for a breadcrumb trail that is, in that window, mostly "page
 * loaded".
 *
 * `loadSentry()` is idempotent: one import, one `init()`, however many callers.
 * The options are registered by `instrumentation-client.ts`; a module that
 * calls `withSentry()` before registration (a unit test, say) gets the SDK
 * without `init()`, which is how `vi.mock('@sentry/nextjs')` keeps working.
 */

export type SentryBrowserModule = typeof import('./sentry-browser-sdk')
export type SentryBrowserOptions = Parameters<SentryBrowserModule['init']>[0]

type Loaded = { module: SentryBrowserModule; initialised: boolean }

let options: SentryBrowserOptions | null = null
let loading: Promise<Loaded> | null = null
let loaded: Loaded | null = null
const earlyErrors: unknown[] = []
let removeEarlyListeners: (() => void) | null = null

/** Idle-time budget before the SDK is fetched regardless (ms). */
export const SENTRY_IDLE_TIMEOUT_MS = 3_000
/** Browsers without requestIdleCallback (Safari) wait this long instead. */
export const SENTRY_FALLBACK_DELAY_MS = 1_500

/** Called once by instrumentation-client.ts, before anything else runs. */
export function registerSentryOptions(next: SentryBrowserOptions): void {
  options = next
}

/**
 * Imports the SDK and runs `init()` once. Safe to call from anywhere, any
 * number of times; the import is the only cost and it is paid once.
 */
export function loadSentry(): Promise<SentryBrowserModule> {
  if (loaded) return Promise.resolve(loaded.module)
  if (!loading) {
    // The named-export subset, never the package itself: see the note in
    // sentry-browser-sdk.ts for the 300 KB that distinction is worth.
    loading = import('./sentry-browser-sdk')
      .then((module) => {
        const canInit = options !== null && typeof module.init === 'function'
        if (canInit && options) module.init(options)
        loaded = { module, initialised: canInit }
        flushEarlyErrors(module)
        return loaded
      })
      .catch((error: unknown) => {
        // A blocked or failed script fetch (ad blocker, captive portal) must
        // not become an unhandled rejection of its own; the next caller may
        // retry the import.
        loading = null
        throw error
      })
  }
  return loading.then((entry) => entry.module)
}

/** Runs `fn` with the SDK once it is available. Never throws into the caller. */
export function withSentry(fn: (sentry: SentryBrowserModule) => void): void {
  void loadSentry()
    .then(fn)
    .catch(() => {})
}

/** True once `init()` has run; tests and the early buffer read it. */
export function isSentryLoaded(): boolean {
  return loaded?.initialised === true
}

/**
 * Catches what the SDK would have caught had it been present from the first
 * byte. Installed synchronously before hydration; removed in the same tick
 * `init()` installs the SDK's own handlers, so nothing is reported twice.
 */
export function installEarlyErrorBuffer(target: Window = window): void {
  if (removeEarlyListeners) return
  const onError = (event: ErrorEvent) => {
    earlyErrors.push(event.error ?? new Error(event.message || 'Unknown error'))
    void loadSentry().catch(() => {})
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    earlyErrors.push(event.reason ?? new Error('Unhandled rejection'))
    void loadSentry().catch(() => {})
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  removeEarlyListeners = () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
    removeEarlyListeners = null
  }
}

function flushEarlyErrors(module: SentryBrowserModule): void {
  removeEarlyListeners?.()
  if (earlyErrors.length === 0) return
  const pending = earlyErrors.splice(0, earlyErrors.length)
  if (typeof module.captureException !== 'function') return
  for (const error of pending) {
    try {
      module.captureException(error instanceof Error ? error : new Error(String(error)))
    } catch {
      // Reporting must never be the thing that throws.
    }
  }
}

/**
 * Schedules the import for the browser's first idle period, with a hard
 * ceiling so a busy page still gets its SDK. The early buffer covers the gap.
 */
export function scheduleSentryLoad(target: Window = window): void {
  const load = () => void loadSentry().catch(() => {})
  if (typeof target.requestIdleCallback === 'function') {
    target.requestIdleCallback(load, { timeout: SENTRY_IDLE_TIMEOUT_MS })
  } else {
    target.setTimeout(load, SENTRY_FALLBACK_DELAY_MS)
  }
}

/**
 * Next calls the exported `onRouterTransitionStart` on every client
 * navigation. Before the SDK is in, there is no navigation span to start and
 * the call is dropped; after, it is the SDK's own hook.
 */
export function routerTransitionStart(href: string, navigationType: string): void {
  loaded?.module.captureRouterTransitionStart?.(href, navigationType)
}

/** Test seam: forget the loaded module, options and buffer. */
export function resetSentryBrowserForTests(): void {
  options = null
  loading = null
  loaded = null
  earlyErrors.splice(0, earlyErrors.length)
  removeEarlyListeners?.()
}
