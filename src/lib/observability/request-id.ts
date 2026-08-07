/**
 * The correlation id, and the one place that decides what may become one.
 *
 * Alone in a module with no Node built-in and no SDK import, because both ends
 * of the wire need it: `src/proxy.ts` mints the id, and the Node runtime reads
 * it back off the forwarded request. A module that pulls in `node:async_hooks`
 * cannot be imported from the first of those, which is why the storage lives
 * next door in request-context.ts rather than here.
 */

/**
 * Lowercase on purpose. `Headers.get` is case-insensitive, but this same
 * constant is also written to a response, and a lowercase name is what HTTP/2
 * requires on the wire anyway.
 */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Long enough for a platform id (Vercel's is 36+, Cloudflare's ray id is 20),
 * short enough that it cannot dominate a log line.
 */
const MAX_LENGTH = 128

/**
 * Deliberately narrower than "no control characters". The id is echoed back in
 * a response header and repeated on every log line for the request, so the set
 * is limited to what an id is actually made of. Anything else gets a fresh id
 * rather than a rejection: a malformed correlation header is not a reason to
 * fail a customer's request, it is a reason to stop trusting that one value.
 */
const SAFE_ID = /^[A-Za-z0-9._:-]+$/

export function newRequestId(): string {
  return crypto.randomUUID()
}

/**
 * The inbound id, if there is one worth keeping.
 *
 * An id that arrives is preferred over a new one so that a trace which started
 * at a load balancer, an uptime monitor or QStash stays one trace through this
 * process. Returns null when there is nothing usable, which is the caller's cue
 * to mint.
 */
export function readRequestId(headers: Headers): string | null {
  const value = headers.get(REQUEST_ID_HEADER)
  if (!value) return null
  if (value.length > MAX_LENGTH) return null
  if (!SAFE_ID.test(value)) return null
  return value
}

/** The inbound id, or a new one. Never returns null. */
export function resolveRequestId(headers: Headers): string {
  return readRequestId(headers) ?? newRequestId()
}
