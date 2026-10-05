import { CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two PostHog calls that are not one of the four money events: the
 * identify at login, and the PostHog-only server event (`gift_sent`).
 *
 * The identify is the one place in the app where consent is read on the
 * SERVER for a PostHog call, so the gate is pinned here in both directions: a
 * current grant sends, and anything else (no cookie, denied, a grant against
 * superseded wording) sends nothing. The money events deliberately have no
 * such gate, which `track-posthog-fanout.test.ts` covers; the difference is
 * that an identify exists only to attach browsing to a person, which is what
 * the banner asks about.
 */

const cookieGet = vi.fn()
let cookiesThrow = false
vi.mock('next/headers', () => ({
  cookies: async () => {
    if (cookiesThrow) throw new Error('cookies() outside a request scope')
    return { get: cookieGet }
  },
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

import { identifyPostHogUser, trackPostHogServerEvent } from './track'

function cookies(jar: Record<string, string>): void {
  cookieGet.mockImplementation((name: string) =>
    jar[name] === undefined ? undefined : { value: jar[name] },
  )
}

const GRANTED = `granted.${CONSENT_WORDING_VERSION}`

beforeEach(() => {
  cookieGet.mockReset()
  trackEvent.mockReset()
  logError.mockReset()
  rpc.mockClear()
  cookiesThrow = false
  isPostHogEnabled.mockReturnValue(true)
  cookies({})
})

describe('identifyPostHogUser', () => {
  it('merges the browser id into the user under $identify once consent is current', async () => {
    cookies({ ke_consent: GRANTED, ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(
      '$identify',
      { distinct_id: 'user-1', $anon_distinct_id: 'browser-abc' },
      { distinctId: 'user-1' },
    )
  })

  it('falls back to the guest session id when the browser blocked the mirror', async () => {
    cookies({ ke_consent: GRANTED, ke_session_id: 'guest-9' })
    await identifyPostHogUser('user-1')
    expect(trackEvent.mock.calls[0]?.[1]).toMatchObject({ $anon_distinct_id: 'guest-9' })
  })

  it('sends an identify with no anonymous half rather than inventing one', async () => {
    cookies({ ke_consent: GRANTED })
    await identifyPostHogUser('user-1')
    expect(trackEvent.mock.calls[0]?.[1]).toEqual({ distinct_id: 'user-1' })
  })

  it('sends nothing without a consent cookie', async () => {
    cookies({ ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends nothing when the visitor declined', async () => {
    cookies({ ke_consent: `denied.${CONSENT_WORDING_VERSION}`, ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('treats a grant against superseded wording as no grant', async () => {
    cookies({ ke_consent: `granted.${CONSENT_WORDING_VERSION - 1}`, ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('does nothing without a key', async () => {
    isPostHogEnabled.mockReturnValue(false)
    cookies({ ke_consent: GRANTED, ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('carries only the auth uuid: no email, no name, no $set', async () => {
    cookies({ ke_consent: GRANTED, ke_ph_id: 'browser-abc' })
    await identifyPostHogUser('user-1')
    const props = trackEvent.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(props).sort()).toEqual(['$anon_distinct_id', 'distinct_id'])
  })

  it('never throws into a login, even when the cookie store does', async () => {
    cookiesThrow = true
    await expect(identifyPostHogUser('user-1')).resolves.toBeUndefined()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith('analytics.posthog_identify_failed', expect.anything())
  })
})

describe('trackPostHogServerEvent', () => {
  it('sends gift_sent to PostHog and touches no database', async () => {
    cookies({ ke_ph_id: 'browser-abc' })
    await trackPostHogServerEvent('gift_sent', { voucher_id: 'v-1', channel: 'transfer' }, 'user-1')
    expect(trackEvent).toHaveBeenCalledWith(
      'gift_sent',
      { source: 'server', user_id: 'user-1', voucher_id: 'v-1', channel: 'transfer' },
      { distinctId: 'browser-abc' },
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is not consent-gated: a gift is a record of something the buyer did', async () => {
    cookies({})
    await trackPostHogServerEvent('gift_sent', { voucher_id: 'v-1' }, 'user-1')
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'user-1' })
  })

  it('files under the user id when there is no request scope at all', async () => {
    // A webhook replay or a cron has no cookies(); the event is not lost.
    cookiesThrow = true
    await trackPostHogServerEvent('gift_sent', { order_id: 'o-1' }, 'user-1')
    expect(trackEvent.mock.calls[0]?.[2]).toEqual({ distinctId: 'user-1' })
    expect(logError).not.toHaveBeenCalled()
  })

  it('maps a whitelist name to the funnel name like the money path does', async () => {
    await trackPostHogServerEvent('voucher_redeemed', {}, null)
    expect(trackEvent.mock.calls[0]?.[0]).toBe('coupon_redeemed')
  })

  it('does nothing without a key', async () => {
    isPostHogEnabled.mockReturnValue(false)
    await trackPostHogServerEvent('gift_sent', {}, 'user-1')
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
