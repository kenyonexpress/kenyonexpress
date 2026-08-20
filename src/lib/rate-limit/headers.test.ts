import { describe, expect, it } from 'vitest'
import { rateLimitHeaders, tooManyRequests } from './headers'
import type { RateLimitDecision } from './limiter'

const NOW = 1_700_000_000_000

function decision(over: Partial<RateLimitDecision> = {}): RateLimitDecision {
  return {
    allowed: true,
    limit: 10,
    windowSeconds: 3600,
    remaining: 6,
    resetAtMs: NOW + 42_000,
    backend: 'upstash',
    ...over,
  }
}

describe('rateLimitHeaders', () => {
  it('reports the limit, what is left, and a DELTA in seconds', () => {
    const headers = rateLimitHeaders(decision(), NOW)
    expect(headers.get('RateLimit-Limit')).toBe('10')
    expect(headers.get('RateLimit-Remaining')).toBe('6')
    // 42 seconds away, not an epoch. A client reading an epoch as a delay
    // sleeps for fifty-five thousand years.
    expect(headers.get('RateLimit-Reset')).toBe('42')
  })

  it('rounds the delta up and never emits zero', () => {
    // Rounding down tells a client to retry while the window is still full;
    // zero tells it to retry immediately, which is a spin.
    expect(rateLimitHeaders(decision({ resetAtMs: NOW + 1200 }), NOW).get('RateLimit-Reset')).toBe(
      '2',
    )
    expect(rateLimitHeaders(decision({ resetAtMs: NOW + 1 }), NOW).get('RateLimit-Reset')).toBe('1')
    expect(rateLimitHeaders(decision({ resetAtMs: NOW - 5000 }), NOW).get('RateLimit-Reset')).toBe(
      '1',
    )
  })

  it('sends Retry-After only on a refusal', () => {
    expect(rateLimitHeaders(decision({ allowed: true }), NOW).get('Retry-After')).toBeNull()
    expect(rateLimitHeaders(decision({ allowed: false }), NOW).get('Retry-After')).toBe('42')
  })

  /**
   * The Postgres fallback returns one boolean and no counter. Filling these in
   * with a plausible number would put fiction in a header that a well-behaved
   * client paces itself against.
   */
  it('omits what the Postgres fallback cannot know rather than inventing it', () => {
    const headers = rateLimitHeaders(
      decision({ backend: 'postgres', remaining: null, resetAtMs: null }),
      NOW,
    )
    expect(headers.get('RateLimit-Limit')).toBe('10')
    expect(headers.get('RateLimit-Remaining')).toBeNull()
    expect(headers.get('RateLimit-Reset')).toBeNull()
  })

  it('falls back to the whole window for Retry-After when the reset time is unknown', () => {
    const headers = rateLimitHeaders(
      decision({ allowed: false, backend: 'postgres', remaining: null, resetAtMs: null }),
      NOW,
    )
    expect(headers.get('Retry-After')).toBe('3600')
  })

  it('reports zero remaining as the string zero, not as absent', () => {
    // `if (remaining)` instead of `if (remaining !== null)` would drop the one
    // value a client most needs to see.
    expect(rateLimitHeaders(decision({ remaining: 0 }), NOW).get('RateLimit-Remaining')).toBe('0')
  })
})

describe('tooManyRequests', () => {
  it('is a 429 carrying the headers and a Hebrew message', async () => {
    const response = tooManyRequests(decision({ allowed: false }))
    expect(response.status).toBe(429)
    expect(response.headers.get('RateLimit-Limit')).toBe('10')
    expect(response.headers.get('Retry-After')).not.toBeNull()
    expect(await response.json()).toEqual({ error: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.' })
  })

  it('lets the caller supply its own body shape', async () => {
    const response = tooManyRequests(decision({ allowed: false }), { ok: false, code: 'slow_down' })
    expect(await response.json()).toEqual({ ok: false, code: 'slow_down' })
  })
})
