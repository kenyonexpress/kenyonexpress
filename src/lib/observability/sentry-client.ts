/**
 * The browser's only door to `@sentry/nextjs`.
 *
 * WHY A LOADER. A static `import * as Sentry` from instrumentation-client.ts,
 * error.tsx or SentryUserSync put the whole SDK (core, browser, browser-utils,
 * tracing, conventions: about 150 KB of source, ~45 KB gzipped) on every
 * route's first load, ahead of hydration (C183). Every client caller now goes
 * through `loadSentry()`, so the SDK is one async chunk fetched once.
 *
 * `instrumentation-client.ts` registers the init options before React
 * hydrates, so whichever caller loads first, `init` runs exactly once and
 * runs first. Errors thrown before the chunk arrives are buffered there and
 * replayed after init; see that file.
 */
type SentryModule = typeof import('@sentry/nextjs')
type SentryOptions = Parameters<SentryModule['init']>[0]

let options: SentryOptions | null = null
let loading: Promise<SentryModule> | null = null
let loaded: SentryModule | null = null

export function configureSentry(next: SentryOptions): void {
  options = next
}

export function loadSentry(): Promise<SentryModule> {
  loading ??= import('@sentry/nextjs').then((Sentry) => {
    if (options) Sentry.init(options)
    loaded = Sentry
    return Sentry
  })
  return loading
}

/** The SDK if it has already loaded, else null. Never triggers a load. */
export function sentryIfLoaded(): SentryModule | null {
  return loaded
}
