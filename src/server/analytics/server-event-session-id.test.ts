import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THREE OF THE FOUR MONEY EVENTS COULD NOT BE WRITTEN, AND THE WHITELIST WAS
 * NOT THE REASON ANY MORE.
 *
 * The project recorded that `purchase`, `begin_checkout`, `voucher_redeemed`
 * and `order_refunded` returned zero rows, and attributed it to the name
 * whitelist in `fn_ingest_analytics_events`. Migration 180 widened that
 * whitelist and is applied. MEASURED against production 2026-09-09 by reading
 * the deployed function and by probing it in transactions that were rolled
 * back, zero residue:
 *
 *   with a session_id     begin_checkout=1 purchase=1 voucher_redeemed=1
 *                         order_refunded=1, invented name=0, 4 rows landed
 *   with none             23502, "null value in column session_id violates
 *                         not-null constraint", nothing landed
 *
 * `analytics_events.session_id` is NOT NULL and `anonymous_id` is not, and the
 * function inserts `session_id` straight from the payload. `trackServerEvent`
 * sent `session_id: anonymousId`, which is null whenever the guest-session
 * cookie is absent. The RPC then fails, PostgREST returns the error rather
 * than throwing it, and the caller logs `analytics.track_failed` and moves on:
 * the event is lost, and the money funnel looks identical to a shop nobody
 * bought anything in.
 *
 * WHICH EVENTS, AND WHY IT IS EXACTLY THREE. The cookie is present only when
 * the request came through our storefront in the shopper's own browser:
 *
 *   begin_checkout    a shopper at checkout          cookie present, worked
 *   purchase          finalize, behind the Cardcom return
 *   order_refunded    an admin action, admin browser
 *   voucher_redeemed  a supplier's till, an API route with no browser of ours
 *
 * So the one event that had a session was the one before the money moved, and
 * all three that report money actually moving did not.
 *
 * WHY A PER-EVENT FALLBACK. `session_id` groups a browsing session, and a till
 * scan has none; a marker keyed on the user would collapse months of unrelated
 * server events into one "session" and read as a real one. `server:<event_id>`
 * is per event and self-identifying, `anonymous_id` stays honestly null, and
 * nothing in production groups by `session_id` -- no view or matview reads
 * `analytics_events` at all -- so it cannot skew an existing query.
 */

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}))

vi.mock('@/lib/observability/posthog', () => ({
  POSTHOG_ID_COOKIE: 'ke_ph_id',
  isPostHogEnabled: () => false,
  trackEvent: vi.fn(),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const rpc = vi.fn(async () => ({ data: 1, error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...(a as [])) }),
}))

vi.mock('@/lib/analytics/attribution', () => ({
  ATTRIBUTION_COOKIE: 'ke_attr',
  parseAttribution: () => null,
}))

vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_session_id',
  parseGuestSessionToken: (value: string | undefined) => value ?? null,
}))

import { trackServerEvent } from './track'

function cookies(jar: Record<string, string>): void {
  cookieGet.mockImplementation((name: string) =>
    jar[name] === undefined ? undefined : { value: jar[name] },
  )
}

/** The single event object handed to `fn_ingest_analytics_events`. */
function sentEvent(): Record<string, unknown> {
  const args = rpc.mock.calls[0] as unknown as [string, { p_events: Record<string, unknown>[] }]
  return args[1].p_events[0] as Record<string, unknown>
}

beforeEach(() => {
  cookieGet.mockReset()
  logError.mockReset()
  rpc.mockClear()
  cookies({})
})

describe('a server event always carries a session_id, because the column is NOT NULL', () => {
  it('SESSION_ID_NEVER_NULL: sends a session_id with no guest cookie at all', async () => {
    // The till, the webhook and the admin panel all look like this.
    await trackServerEvent({
      eventName: 'voucher_redeemed',
      userId: 'supplier-member-1',
      props: { code: 'ABCD123456' },
    })

    const event = sentEvent()
    expect(event.session_id).not.toBeNull()
    expect(event.session_id).toEqual(expect.any(String))
    expect(String(event.session_id).length).toBeGreaterThan(0)
  })

  it('marks the synthetic one, so it cannot be read as a real browsing session', async () => {
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: { order_id: 'o-1' } })

    expect(String(sentEvent().session_id)).toMatch(/^server:/)
  })

  it('leaves anonymous_id null rather than inventing one for it too', async () => {
    // `anonymous_id` IS nullable in production, so the honest value is null.
    await trackServerEvent({ eventName: 'order_refunded', userId: 'user-1', props: {} })

    expect(sentEvent().anonymous_id).toBeNull()
  })

  it('uses the real guest session when there is one, and does not prefix it', async () => {
    // `begin_checkout` is the event that always had a cookie, and its rows must
    // keep joining to the browser half of the funnel.
    cookies({ ke_session_id: 'guest-session-uuid' })

    await trackServerEvent({ eventName: 'begin_checkout', userId: null, props: {} })

    const event = sentEvent()
    expect(event.session_id).toBe('guest-session-uuid')
    expect(event.anonymous_id).toBe('guest-session-uuid')
  })

  it('keeps session_id inside the 64 characters the column truncates at', async () => {
    // `fn_ingest_analytics_events` applies left(..., 64). A fallback longer
    // than that would be silently cut, which is how two events could end up
    // sharing a "session".
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })

    expect(String(sentEvent().session_id).length).toBeLessThanOrEqual(64)
  })

  it('files the row under the same id it declares as the event id', async () => {
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })

    const event = sentEvent()
    expect(String(event.session_id)).toBe(`server:${String(event.event_id)}`)
  })
})
