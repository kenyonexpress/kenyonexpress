/**
 * A `fetch` that is guaranteed to settle.
 *
 * WHY THIS EXISTS. A bare `fetch` has no timeout. Not a long one -- none. A
 * host that completes the TCP handshake and then never answers holds the
 * caller open until something else gives up, and on a serverless platform the
 * only thing that gives up is the platform's own request ceiling. Until then
 * the function is alive, billed by wall clock, and occupying one slot of a
 * bounded concurrency pool. One unreachable third party is therefore enough to
 * exhaust the pool and take down routes that never touched it.
 *
 * The reasoning, the AbortController shape and the `clearTimeout` in a
 * `finally` are all lifted from `src/lib/payments/cardcom.ts`, which worked
 * this out first for the card gateway. This module is that argument applied to
 * every other outbound call, so the next one does not have to restate it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: retry. `cardcom.ts` explains why at
 * length, and the short version is that a POST which times out has not
 * necessarily failed -- the request may have arrived and only the response may
 * be lost. Retrying that is how a card is charged twice, an invoice is issued
 * twice, or a voucher message is delivered twice. Whether a given endpoint is
 * safe to repeat is knowledge the call site has and this helper does not, so
 * retry stays opt-in at the call site and is not offered here.
 */

/** The default ceiling, in milliseconds, when a call site names no other. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/**
 * Thrown when OUR timer fired. Distinct from the `AbortError` that a caller's
 * own signal produces, because the two mean different things: this one is the
 * remote host failing to answer, and is worth an alert; the other is our own
 * code cancelling work it no longer needs, and is not.
 */
export class FetchTimeoutError extends Error {
  readonly name = 'FetchTimeoutError'
  readonly timeoutMs: number
  readonly url: string

  constructor(url: string, timeoutMs: number) {
    super(`fetch to ${url} exceeded ${timeoutMs}ms`)
    this.timeoutMs = timeoutMs
    this.url = url
  }
}

/**
 * Read per call rather than at module load, for the reason `cardcom.ts` gives:
 * a value pinned at module load survives for the life of a warm instance, so a
 * change to the variable would not take effect until the instance is recycled.
 */
function defaultTimeoutMs(): number {
  const parsed = Number(process.env.OUTBOUND_FETCH_TIMEOUT_MS)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS
}

/** Best effort, for the error message only. Never throws on an odd input. */
function describeTarget(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return typeof input?.url === 'string' ? input.url : '[request]'
}

export type FetchWithTimeoutOptions = RequestInit & {
  /** Overrides `OUTBOUND_FETCH_TIMEOUT_MS` for this one call. */
  timeoutMs?: number
}

/**
 * `fetch`, with a ceiling.
 *
 * A caller's own `signal` is honoured as well as the timer, not instead of it:
 * whichever fires first aborts the request. That composition is the whole
 * reason this cannot be a one-line `AbortSignal.timeout(ms)` -- passing that
 * as `signal` would silently DROP a caller's cancellation, which is a quieter
 * bug than the one being fixed.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs, signal: callerSignal, ...init } = options
  const ms = timeoutMs ?? defaultTimeoutMs()

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ms)

  const forwardCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', forwardCallerAbort, { once: true })
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    // Only OUR timer earns the timeout error. A caller-driven abort is
    // re-thrown untouched so that `error.name === 'AbortError'` still means
    // what the caller expects it to mean.
    if (timedOut && !callerSignal?.aborted) {
      throw new FetchTimeoutError(describeTarget(input), ms)
    }
    throw error
  } finally {
    // Always, including on the success path: an uncleared timer keeps the event
    // loop alive and, in a long-lived process, aborts nothing while still
    // holding a reference to the controller.
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forwardCallerAbort)
  }
}
