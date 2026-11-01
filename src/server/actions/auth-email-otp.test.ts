import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const verifyOtp = vi.hoisted(() => vi.fn())
const updateUser = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn())
const verifierSignIn = vi.hoisted(() => vi.fn())
const verifierSignOut = vi.hoisted(() => vi.fn())
const createPublicClient = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn())
const mergeGuestCart = vi.hoisted(() => vi.fn())
const getGuestSessionId = vi.hoisted(() => vi.fn())
const claimReferralOnce = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn())
const cookieDelete = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/supabase/anon', () => ({ createPublicClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp }))
vi.mock('@/server/actions/cart', () => ({ mergeGuestCart }))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'guest_session',
  getGuestSessionId,
}))
vi.mock('@/server/referrals/claim', () => ({ claimReferralOnce }))
vi.mock('@/server/auth/magic-link-send', () => ({ trySendBrandedMagicLink: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: cookieDelete }) }))

import { changePassword, verifyEmailOtp } from './auth'

const USER_ID = '00000000-0000-4000-8000-000000000042'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.9')
  checkRateLimit.mockResolvedValue(true)
  getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'u@example.com' } } })
  verifyOtp.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  updateUser.mockResolvedValue({ error: null })
  createClient.mockResolvedValue({ auth: { getUser, verifyOtp, updateUser } })
  createAdminClient.mockReturnValue({})
  verifierSignIn.mockResolvedValue({ error: null })
  verifierSignOut.mockResolvedValue({ error: null })
  createPublicClient.mockReturnValue({
    auth: { signInWithPassword: verifierSignIn, signOut: verifierSignOut },
  })
  getGuestSessionId.mockResolvedValue(null)
  mergeGuestCart.mockResolvedValue(false)
  claimReferralOnce.mockResolvedValue(undefined)
})

describe('verifyEmailOtp', () => {
  it('verifies the code as an email OTP against the lower-cased address, then redirects', async () => {
    await verifyEmailOtp(null, form({ email: 'User@Example.com', token: '482913', next: '/cart' }))
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '482913',
      type: 'email',
    })
    expect(redirect).toHaveBeenCalledWith('/cart')
  })

  it('is ceilinged per IP and per address before GoTrue is asked', async () => {
    await verifyEmailOtp(null, form({ email: 'u@example.com', token: '482913' }))
    expect(checkRateLimit).toHaveBeenCalledWith('email-verify:203.0.113.9', 20, 3600)
    expect(checkRateLimit).toHaveBeenCalledWith('email-verify-address:u@example.com', 20, 3600)

    checkRateLimit.mockResolvedValue(false)
    verifyOtp.mockClear()
    const result = await verifyEmailOtp(null, form({ email: 'u@example.com', token: '482913' }))
    expect(result && 'error' in result).toBe(true)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('refuses a non-numeric code without a round trip', async () => {
    const result = await verifyEmailOtp(null, form({ email: 'u@example.com', token: 'abc' }))
    expect(result && 'error' in result).toBe(true)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('says one thing for a wrong, reused or expired code', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    })
    const result = await verifyEmailOtp(null, form({ email: 'u@example.com', token: '000000' }))
    expect(result).toEqual({ error: 'הקוד שגוי או שפג תוקפו — בקשו קוד חדש' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('does the callback route’s work: merges the guest cart, claims the referral', async () => {
    getGuestSessionId.mockResolvedValue('11111111-1111-4111-8111-111111111111')
    mergeGuestCart.mockResolvedValue(true)
    await verifyEmailOtp(null, form({ email: 'u@example.com', token: '482913' }))
    expect(mergeGuestCart).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      '11111111-1111-4111-8111-111111111111',
    )
    expect(cookieDelete).toHaveBeenCalledWith('guest_session')
    expect(claimReferralOnce).toHaveBeenCalledWith(USER_ID, '11111111-1111-4111-8111-111111111111')
  })

  it('keeps the guest cookie when nothing was merged', async () => {
    getGuestSessionId.mockResolvedValue('11111111-1111-4111-8111-111111111111')
    mergeGuestCart.mockResolvedValue(false)
    await verifyEmailOtp(null, form({ email: 'u@example.com', token: '482913' }))
    expect(cookieDelete).not.toHaveBeenCalled()
  })

  it('never redirects off-site', async () => {
    await verifyEmailOtp(
      null,
      form({ email: 'u@example.com', token: '482913', next: 'https://evil.example/' }),
    )
    const target = redirect.mock.calls[0]?.[0] as string
    expect(target.startsWith('/')).toBe(true)
    expect(target.startsWith('//')).toBe(false)
  })
})

describe('changePassword', () => {
  const VALID = {
    current_password: 'OldSecret1',
    password: 'NewSecret2',
    confirm_password: 'NewSecret2',
  }

  it('refuses without a session, before any check', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await changePassword(null, form(VALID))
    expect(result).toEqual({ error: 'יש להתחבר' })
    expect(verifierSignIn).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('re-proves the current password on a throwaway client and revokes what it minted', async () => {
    const result = await changePassword(null, form(VALID))
    expect(verifierSignIn).toHaveBeenCalledWith({ email: 'u@example.com', password: 'OldSecret1' })
    expect(verifierSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewSecret2' })
    expect(result).toEqual({ success: 'הסיסמה עודכנה' })
  })

  it('does not touch the password when the current one is wrong', async () => {
    verifierSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const result = await changePassword(null, form(VALID))
    expect(result).toEqual({ error: 'הסיסמה הנוכחית שגויה' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('is ceilinged on the session, not the IP', async () => {
    await changePassword(null, form(VALID))
    expect(checkRateLimit).toHaveBeenCalledWith(`change-password:${USER_ID}`, 10, 3600)
    checkRateLimit.mockResolvedValue(false)
    verifierSignIn.mockClear()
    const result = await changePassword(null, form(VALID))
    expect(result && 'error' in result).toBe(true)
    expect(verifierSignIn).not.toHaveBeenCalled()
  })

  it('holds the new password to the schema before asking GoTrue anything', async () => {
    const result = await changePassword(null, form({ ...VALID, confirm_password: 'Other123' }))
    expect(result).toEqual({ error: 'הסיסמאות אינן תואמות' })
    expect(verifierSignIn).not.toHaveBeenCalled()
  })
})
