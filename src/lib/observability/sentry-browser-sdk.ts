/**
 * The slice of `@sentry/nextjs` the browser actually calls, as NAMED
 * re-exports. `sentry-browser.ts` dynamic-imports this file, not the package.
 *
 * The difference is 300 KB. Measured on the 2026-10-07 build: a namespace
 * `import('@sentry/nextjs')` keeps every export alive, and the deferred chunk
 * came out at 549,624 bytes with 161 rrweb/replay markers and 59 feedback
 * markers in it, for a configuration that sets both replay rates to 0 and has
 * no feedback widget. Named imports through this module let Turbopack drop
 * what nothing references, exactly as the old static import did.
 *
 * Add a name here when a browser caller needs it; do not import the package
 * directly from a client component (src/__tests__/first-load-client-graph.test.ts
 * refuses the static form, and the namespace dynamic form is the trap above).
 */
export {
  captureException,
  captureMessage,
  captureRouterTransitionStart,
  init,
  setTag,
  setUser,
  withScope,
} from '@sentry/nextjs'
