/**
 * The gate in front of the deliberate-error endpoints under `/debug/sentry`
 * and `/api/debug/sentry`.
 *
 * WHY THOSE ENDPOINTS EXIST AT ALL. `scripts/sentry-verify.mjs` proves the DSN
 * reaches ingest, which is the transport and nothing else. It says nothing
 * about the part that is easy to get wrong: whether NEXT'S OWN error path is
 * wired, i.e. whether `onRequestError` in src/instrumentation.ts is exported
 * from the file Next actually loads and fires for a Server Component, a Route
 * Handler and a Server Function. That can only be answered by making the
 * framework catch a real error, and on a deploy it is the only way to answer it
 * at all.
 *
 * WHY IT IS GATED RATHER THAN DELETED AFTER USE. A route that throws on demand
 * is a free 500 for anyone who finds it, and the interesting one is that
 * `/api/payments/` and `/checkout` errors ALSO push to Ofir's phone via
 * `alertMoneyFailure` - so an ungated thrower on the wrong path is a remote
 * pager. Deleting the routes after a one-off test would mean the next deploy
 * cannot be verified without writing them again, which is how a verification
 * step stops being run. Gated, they can be turned on for a minute and off
 * again, and the off state is the default everywhere including production.
 *
 * The flag is deliberately not a boolean-ish string like "true": a stray
 * `SENTRY_DEBUG_ROUTES=1` in a copied env block should not open it.
 */
export function debugErrorRoutesEnabled(): boolean {
  return process.env.SENTRY_DEBUG_ROUTES === 'i-know-what-this-does'
}
