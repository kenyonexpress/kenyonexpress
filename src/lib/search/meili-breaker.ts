/**
 * THE BREAKER IN FRONT OF MEILISEARCH, AND WHY THIS ONE DEPENDENCY GETS ONE.
 *
 * `searchProductsServer` degrades three ways already: Meilisearch, then the
 * Postgres full-text RPC, then ILIKE. That chain handles an ENGINE THAT ANSWERS
 * BADLY - a 400 from an unconfigured index, a thrown connection refusal - and it
 * has never handled an engine that does not answer at all. The call was a bare
 * `fetch` with no signal, so a Meilisearch that accepts the connection and then
 * hangs holds the shopper's request until the platform's own ceiling kills it,
 * and `cache: 'no-store'` means every search pays that in full.
 *
 * A timeout alone fixes the single request and leaves the fleet paying it: with
 * the engine down, every search waits the full timeout before falling back, and
 * search is already the slowest read in the application (615ms p95 under load
 * against 62ms for a product page, `docs/CAPACITY.md`). So the timeout comes
 * with this: after three consecutive failures the breaker opens for thirty
 * seconds and searches go straight to Postgres.
 *
 * WHAT IT IS NOT. This is per-process state on a serverless platform, so it
 * coordinates nothing across instances - every warm instance learns for itself.
 * That is the whole intended benefit and it is worth stating plainly rather than
 * implying a fleet-wide breaker: what it buys is that ONE instance stops paying
 * the timeout on every request for as long as the engine is down.
 *
 * THE COOLDOWN IS SHORT ON PURPOSE. Thirty seconds is one probe every thirty
 * seconds while the engine is down, which is nothing, and at most thirty seconds
 * of Postgres results after it recovers. A long cooldown would turn a blip into
 * minutes of degraded relevance; the fallback returns real results, so being
 * wrong in this direction costs ranking quality and not a blank page.
 */

export type BreakerState = {
  /** Consecutive failures. Reset by any success. */
  failures: number
  /** Epoch ms until which the breaker refuses to call. 0 = closed. */
  openUntil: number
}

export const FAILURE_THRESHOLD = 3
export const COOLDOWN_MS = 30_000

export const closed: BreakerState = { failures: 0, openUntil: 0 }

export function isOpen(state: BreakerState, now: number): boolean {
  return state.openUntil > now
}

export function recordFailure(state: BreakerState, now: number): BreakerState {
  const failures = state.failures + 1
  // Re-arm on every failure at or past the threshold, not only on the third.
  // Otherwise the fourth failure - which happens on the first probe after a
  // cooldown that changed nothing - would leave the breaker closed and put the
  // timeout back in front of every request.
  return failures >= FAILURE_THRESHOLD
    ? { failures, openUntil: now + COOLDOWN_MS }
    : { failures, openUntil: 0 }
}

export function recordSuccess(_state: BreakerState): BreakerState {
  return closed
}
