/**
 * Recognise the rejection Next.js hands to work it abandoned at the end of a
 * prerender, so a log line does not call it a failed query.
 *
 * With cacheComponents, a route's static shell is prerendered at build time
 * and again on revalidation. Any fetch, `cookies()` or `headers()` still
 * pending when the shell completes is rejected with a
 * `HangingPromiseRejectionError` ("During prerendering, fetch() rejects when
 * the prerender is complete ..."). React handles it for the component tree;
 * the code that observes it here is the fetch layer under supabase-js and the
 * call sites whose `.catch` or `{ error }` branch runs after supabase-js has
 * already turned the throw into `{ error: { message } }`.
 *
 * Measured on `pnpm build` (25.09): 273 `db.query_failed` at ERROR and 48
 * call-site WARNs, every one this rejection, zero real query failures. That
 * volume drowns the outage those events exist to surface.
 *
 * Two shapes because supabase-js keeps only the message: the thrown error
 * carries `digest === 'HANGING_PROMISE_REJECTION'` (a public Next.js marker),
 * and the wrapped one carries Next's fixed phrase in `message`.
 */

const HANGING_PROMISE_REJECTION = 'HANGING_PROMISE_REJECTION'
const PRERENDER_PHRASE = 'rejects when the prerender is complete'

export function isPrerenderAbort(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  if ('digest' in err && err.digest === HANGING_PROMISE_REJECTION) return true
  const message = 'message' in err ? err.message : null
  return typeof message === 'string' && message.includes(PRERENDER_PHRASE)
}
