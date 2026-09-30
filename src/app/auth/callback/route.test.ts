import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE ONE ROUTE EVERY WAY INTO AN ACCOUNT PASSES THROUGH.
 *
 * Google, the magic link and the password-reset mail all come back here to
 * exchange a code for a session, so its failure branch is the failure branch of
 * all three. Two things about that branch are worth pinning, and neither is
 * visible from the pure helpers:
 *
 * 1. It never leaves the site. `next` arrives from a URL an attacker can write,
 *    and `safeNextPath` is what makes `//evil.com` harmless - but only because
 *    the route calls it. The redirect built here reads that same value back.
 *
 * 2. It keeps the destination. Everything that lands here came from somewhere,
 *    and the screen it redirects to is where the customer retries.
 *
 * The exchange itself is mocked: what is under test is what the route does with
 * the answer, not Supabase.
 */

const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}))
vi.mock('@/server/actions/cart', () => ({ mergeGuestCart: vi.fn() }))
vi.mock('@/server/analytics/track', () => ({ linkAnalyticsIdentity: vi.fn() }))

import { GET } from './route'

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`https://shop.test/auth/callback${query}`))
}

/** The Location header, parsed. */
async function location(query: string): Promise<URL> {
  const res = await get(query)
  expect(res.status).toBe(307)
  return new URL(res.headers.get('location') ?? '')
}

beforeEach(() => {
  exchangeCodeForSession.mockReset()
  verifyOtp.mockReset()
  verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  // The whole failure surface: no code, a code Supabase rejects, and a code it
  // accepts without handing back a session. All three land in the same branch.
  exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } })
})

describe('a failed exchange', () => {
  it('sends the customer to login with the error flag', async () => {
    for (const query of ['', '?code=expired', '?code=']) {
      const url = await location(query)
      expect(url.pathname, query).toBe('/login')
      expect(url.searchParams.get('error'), query).toBe('auth_callback_error')
    }
  })

  it('carries the destination through so the retry lands there', async () => {
    const url = await location('?code=expired&next=%2Fcheckout%2Freturn')
    expect(url.searchParams.get('next')).toBe('/checkout/return')
  })

  it('leaves next off entirely when there was nowhere in particular to go', async () => {
    // The bare failure URL stays exactly as it was rather than gaining `next=/`.
    const url = await location('?code=expired')
    expect(url.searchParams.has('next')).toBe(false)
    expect(url.search).toBe('?error=auth_callback_error')
  })

  it('refuses to carry a destination that leaves the site', async () => {
    // `safeNextPath` collapses each of these to `/`, which is then dropped - so
    // the hostile value cannot even ride along as a query parameter.
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
      const url = await location(`?code=expired&next=${encodeURIComponent(evil)}`)
      expect(url.origin, evil).toBe('https://shop.test')
      expect(url.searchParams.has('next'), evil).toBe(false)
    }
  })
})

describe('a successful exchange', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })
  })

  it('lands on the requested page', async () => {
    const url = await location('?code=good&next=%2Faccount%2Forders')
    expect(url.pathname).toBe('/account/orders')
    expect(url.origin).toBe('https://shop.test')
  })

  it('never lands off-site', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
      const url = await location(`?code=good&next=${encodeURIComponent(evil)}`)
      expect(url.origin, evil).toBe('https://shop.test')
      expect(url.pathname, evil).toBe('/')
    }
  })
})

describe('the custom-sent token_hash leg', () => {
  it('verifies a magic link as magiclink when no type is named', async () => {
    const url = await location('?token_hash=pkce_abc&next=%2Faccount')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'pkce_abc' })
    expect(url.pathname).toBe('/account')
  })

  it('verifies the password-reset mail as recovery and lands on the reset form', async () => {
    // password-reset-send.ts mints a recovery hash; GoTrue refuses it under
    // the magiclink type, so the type has to ride along and be honoured.
    const url = await location('?token_hash=pkce_rec&type=recovery&next=%2Freset-password')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'pkce_rec' })
    expect(url.pathname).toBe('/reset-password')
    expect(url.origin).toBe('https://shop.test')
  })

  it('collapses any other type to magiclink rather than letting the URL choose', async () => {
    await location('?token_hash=pkce_abc&type=signup')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'pkce_abc' })
  })

  it('sends a rejected hash to login with the error flag and the destination kept', async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } })
    const url = await location('?token_hash=old&type=recovery&next=%2Freset-password')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('error')).toBe('auth_callback_error')
    expect(url.searchParams.get('next')).toBe('/reset-password')
  })
})
