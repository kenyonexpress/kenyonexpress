import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S07: the two callback legs of "after payment, sign in with Google and attach
 * the order". The normal case is a linked identity (same id, nothing to move);
 * these pin the case where the Google account already existed.
 */

const exchangeCodeForSession = vi.fn()
const signInWithOAuth = vi.fn()
const getUser = vi.fn()
const attachGuestOrders = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession, verifyOtp: vi.fn(), signInWithOAuth, getUser },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    rpc: async () => ({ error: null }),
  }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}))
vi.mock('@/server/actions/cart', () => ({ mergeGuestCart: vi.fn() }))
vi.mock('@/server/analytics/track', () => ({
  linkAnalyticsIdentity: vi.fn(),
  identifyPostHogUser: vi.fn(),
}))
vi.mock('@/server/referrals/claim', () => ({ claimReferralOnce: vi.fn() }))
vi.mock('@/server/auth/guest-orders', () => ({
  attachGuestOrders: (...args: unknown[]) => attachGuestOrders(...args),
}))

import { GET } from './route'

const ANON = { id: 'anon-1', is_anonymous: true }
const NEXT = encodeURIComponent('/checkout/return?order_id=o1')

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`https://shop.test/auth/callback${query}`))
}

beforeEach(() => {
  exchangeCodeForSession.mockReset()
  signInWithOAuth.mockReset()
  getUser.mockReset()
  attachGuestOrders.mockReset()
  getUser.mockResolvedValue({ data: { user: ANON } })
})

describe('a refused link (the Google account already exists)', () => {
  it('starts a plain Google sign-in that returns to the same page', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.test/o' } })
    const res = await get(
      `?next=${NEXT}&guest_link=1&error=server_error&error_code=identity_already_exists`,
    )
    expect(res.headers.get('location')).toBe('https://accounts.google.test/o')
    const redirectTo = signInWithOAuth.mock.calls[0]?.[0]?.options?.redirectTo as string
    expect(new URL(redirectTo).searchParams.get('next')).toBe('/checkout/return?order_id=o1')
  })

  it('is not triggered by an error that did not come from the guest prompt', async () => {
    const res = await get(`?next=${NEXT}&error_code=identity_already_exists`)
    expect(signInWithOAuth).not.toHaveBeenCalled()
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login')
  })
})

describe('the code exchange after a guest paid', () => {
  it('hands the guest rows to the account that signed in', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'acct-1', email: 'a@b.co' } } },
      error: null,
    })
    const res = await get(`?code=c&next=${NEXT}`)
    expect(attachGuestOrders).toHaveBeenCalledWith(expect.anything(), ANON, 'acct-1')
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/checkout/return')
  })

  it('moves nothing when linkIdentity kept the same id', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'anon-1', email: 'a@b.co' } } },
      error: null,
    })
    await get(`?code=c&next=${NEXT}`)
    expect(attachGuestOrders).not.toHaveBeenCalled()
  })

  it('moves nothing off a session that was a real account', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'acct-0', is_anonymous: false } } })
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'acct-1', email: 'a@b.co' } } },
      error: null,
    })
    await get(`?code=c&next=${NEXT}`)
    expect(attachGuestOrders).not.toHaveBeenCalled()
  })
})
