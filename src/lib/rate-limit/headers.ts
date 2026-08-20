import type { RateLimitDecision } from './limiter'

/**
 * `RateLimit-*` response headers, per the IETF draft the major CDNs converged
 * on (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`), plus
 * `Retry-After` from RFC 9110 on a refusal.
 *
 * WHY BOTH. `Retry-After` is the one a browser, a CDN and every HTTP client
 * already understand, and it is only meaningful on the 429. The `RateLimit-*`
 * trio is what lets a WELL-BEHAVED client — `apps/mobile`, which is a second
 * caller of these routes — pace itself BEFORE it is refused. Sending only the
 * former means the app can never do better than back off after being told no.
 *
 * `RateLimit-Reset` IS A DELTA IN SECONDS, not a timestamp. The draft is
 * explicit about it and it is the single most common way these headers are got
 * wrong; a client that reads an epoch value as a delay sleeps for fifty-five
 * thousand years.
 *
 * OMITTED, NOT FAKED. On the Postgres fallback `remaining` and `resetAtMs` are
 * genuinely unknown, so those two headers are left off rather than filled with
 * a guess. A missing header makes a client fall back to its own backoff; a
 * wrong one makes it pace against fiction.
 */
export function rateLimitHeaders(decision: RateLimitDecision, nowMs = Date.now()): Headers {
  const headers = new Headers()
  headers.set('RateLimit-Limit', String(decision.limit))

  if (decision.remaining !== null) {
    headers.set('RateLimit-Remaining', String(decision.remaining))
  }

  const resetSeconds = resetDeltaSeconds(decision, nowMs)
  if (resetSeconds !== null) headers.set('RateLimit-Reset', String(resetSeconds))
  if (!decision.allowed) headers.set('Retry-After', String(resetSeconds ?? decision.windowSeconds))

  return headers
}

/**
 * Rounded UP, and never below one. Rounding down tells a client to retry at the
 * instant the window is still full, which turns one refusal into two requests;
 * a zero tells it to retry immediately, which turns one refusal into a spin.
 */
function resetDeltaSeconds(decision: RateLimitDecision, nowMs: number): number | null {
  if (decision.resetAtMs === null) return null
  return Math.max(1, Math.ceil((decision.resetAtMs - nowMs) / 1000))
}

/** The refusal itself, so no route has to remember the status code or the shape. */
export function tooManyRequests(decision: RateLimitDecision, body?: unknown): Response {
  const headers = rateLimitHeaders(decision)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body ?? { error: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }), {
    status: 429,
    headers,
  })
}
