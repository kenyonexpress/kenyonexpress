import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The money funnel reaching PostHog, and being filed under an id that joins.
 *
 * WHY THIS FILE EXISTS. The four names `trackServerEvent` emits are the only
 * events in the product that say money moved, and until this fan-out they had
 * exactly one destination: `fn_ingest_analytics_events`, whose live whitelist
 * discards all four (measured 2026-09-06, still true). PostHog therefore had a
 * funnel that ended at `checkout_step` with nothing to convert to, and neither
 * `purchase` nor `voucher_redeemed` can ever arrive from the browser: the first
 * is deliberately server-side, the second happens on a supplier's till.
 *
 * The identity assertions are the point of the rest. A PostHog funnel joins on
 * `distinct_id` and nothing else, so an event that arrives under the wrong id
 * is not a smaller funnel, it is a funnel that reports a hundred checkouts and
 * zero purchases while looking healthy.
 */

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}))

const trackEvent = vi.fn()
const isPostHogEnabled = vi.fn(() => true)
vi.mock('@/lib/observability/posthog', () => ({
  POSTHOG_ID_COOKIE: 'ke_ph_id',
  isPostHogEnabled: () => isPostHogEnabled(),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

let rpcResult: { data: unknown; error: unknown } = { data: 1, error: null }
const rpc = vi.fn(async () => rpcResult)
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

/** Cookie jar keyed by name; anything unset reads as absent, as it does live. */
function cookies(jar: Record<string, string>): void {
  cookieGet.mockImplementation((name: string) =>
    jar[name] === undefined ? undefined : { value: jar[name] },
  )
}

beforeEach(() => {
  cookieGet.mockReset()
  trackEvent.mockReset()
  logError.mockReset()
  rpc.mockClear()
  rpcResult = { data: 1, error: null }
  isPostHogEnabled.mockReturnValue(true)
  cookies({})
})

describe('the four money events reach PostHog', () => {
  it('sends purchase, which the browser never fires', async () => {
    cookies({ ke_ph_id: 'ph-abc' })
    await trackServerEvent({
      eventName: 'purchase',
      userId: 'user-1',
      props: { order_id: 'order-1' },
    })

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent.mock.calls[0]?.[0]).toBe('purchase')
    expect(trackEvent.mock.calls[0]?.[1]).toMatchObject({
      source: 'server',
      user_id: 'user-1',
      order_id: 'order-1',
    })
  })

  it('sends voucher_redeemed, which happens on a till with no browser of ours', async () => {
    cookies({})
    await trackServerEvent({
      eventName: 'voucher_redeemed',
      userId: 'member-1',
      props: { code: 'PRBE00000A' },
    })
    expect(trackEvent.mock.calls[0]?.[0]).toBe('voucher_redeemed')
    expect(trackEvent.mock.calls[0]?.[1]).toMatchObject({ code: 'PRBE00000A' })
  })
})

describe('which identity the event is filed under', () => {
  it('prefers the mirrored browser id, because that is the only one that joins', async () => {
    // The client half of the funnel is keyed on this value. Filing the
    // conversion anywhere else reports checkouts that never convert.
    cookies({ ke_ph_id: 'ph-abc', ke_session_id: 'guest-9' })
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'ph-abc' })
  })

  it('falls back to the guest session id when the browser blocked the mirror', async () => {
    cookies({ ke_session_id: 'guest-9' })
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'guest-9' })
  })

  it('uses the user id only as the last resort, never in preference', async () => {
    // Preferring it would split every logged-in shopper into an anonymous
    // browsing half and a separate purchasing half.
    cookies({})
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'user-1' })
  })

  it('ignores an over-long cookie rather than bucketing on it', async () => {
    cookies({ ke_ph_id: 'x'.repeat(129), ke_session_id: 'guest-9' })
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'guest-9' })
  })
})

describe('what must not travel', () => {
  it('sends no money, since revenue is read from the order rows', async () => {
    await trackServerEvent({
      eventName: 'purchase',
      userId: 'user-1',
      props: { order_id: 'order-1', total_agorot: 12_345, customer_email: 'a@b.co' },
    })
    const props = trackEvent.mock.calls[0]?.[1] as Record<string, unknown>
    expect(props).not.toHaveProperty('total_agorot')
    expect(props).not.toHaveProperty('customer_email')
  })

  it('drops a non-scalar prop instead of shipping the object it came from', async () => {
    await trackServerEvent({
      eventName: 'purchase',
      userId: 'user-1',
      props: { order_id: { id: 'order-1', card: '4580' } },
    })
    expect(trackEvent.mock.calls[0]?.[1]).not.toHaveProperty('order_id')
  })
})

describe('the two pipelines do not depend on each other', () => {
  it('still reaches PostHog when the database discards the event', async () => {
    // Today's production behaviour: the whitelist accepts 0 of 1. PostHog is
    // the half that works without migration 169, so it must not be conditional
    // on the half that does not.
    rpcResult = { data: 0, error: null }
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith('analytics.event_rejected', expect.anything())
  })

  it('still reaches PostHog when the database refuses outright', async () => {
    rpcResult = { data: null, error: { message: 'permission denied' } }
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith('analytics.track_failed', expect.anything())
  })

  it('writes to the database even when PostHog is not configured', async () => {
    isPostHogEnabled.mockReturnValue(false)
    await trackServerEvent({ eventName: 'purchase', userId: 'user-1', props: {} })
    expect(trackEvent).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
