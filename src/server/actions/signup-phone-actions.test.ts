import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The signup code screen's two actions. What can only fail here: both
 * ceilings are checked before Redis or Twilio are touched, the verify binds
 * the phone to the user id the CHALLENGE carries (never one the form
 * claims), the profile stamp survives an unapplied 254, a number another
 * account already holds does not sink the signup, and success lands on the
 * email step with the phone marked verified.
 */

const checkRateLimit = vi.fn()
const verifyPhoneOtp = vi.fn()
const issueSignupPhoneOtp = vi.fn()
const readSignupUid = vi.fn()
const clearSignupUid = vi.fn()
const updateUserById = vi.fn()
const profileUpdate = vi.fn()
const redirect = vi.fn()
const logWarn = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/sms/otp', () => ({ verifyPhoneOtp: (...a: unknown[]) => verifyPhoneOtp(...a) }))
vi.mock('@/server/auth/signup-phone-otp', () => ({
  issueSignupPhoneOtp: (...a: unknown[]) => issueSignupPhoneOtp(...a),
  readSignupUid: () => readSignupUid(),
  clearSignupUid: () => clearSignupUid(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: (...a: unknown[]) => updateUserById(...a) } },
    from: () => ({
      update: (payload: unknown) => ({ eq: (...a: unknown[]) => profileUpdate(payload, ...a) }),
    }),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    redirect(path)
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    warn: (...a: unknown[]) => logWarn(...a),
    error: (...a: unknown[]) => logError(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

import { resendSignupPhoneOtp, verifySignupPhone } from './signup-phone'

const UID = '11111111-1111-4111-8111-111111111111'
const E164 = '+972501234567'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  readSignupUid.mockResolvedValue(UID)
  issueSignupPhoneOtp.mockResolvedValue({ ok: true, to: E164, expiresAt: 'x', segments: 1 })
  verifyPhoneOtp.mockResolvedValue({ result: 'ok', userId: UID })
  updateUserById.mockResolvedValue({ data: {}, error: null })
  profileUpdate.mockResolvedValue({ error: null })
})

describe('resendSignupPhoneOtp', () => {
  it('checks the IP ceiling, the shape, then the number ceiling, before sending', async () => {
    checkRateLimit.mockResolvedValueOnce(false)
    expect(await resendSignupPhoneOtp(null, form({ phone: '050-1234567' }))).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(issueSignupPhoneOtp).not.toHaveBeenCalled()

    expect(await resendSignupPhoneOtp(null, form({ phone: '03-1234567' }))).toMatchObject({
      error: expect.stringContaining('05X'),
    })

    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('signup-otp-number:'))
    expect(await resendSignupPhoneOtp(null, form({ phone: '050-1234567' }))).toMatchObject({
      error: expect.stringContaining('למספר הזה'),
    })
    expect(checkRateLimit).toHaveBeenCalledWith(`signup-otp-number:${E164}`, 5, 3600)
    expect(issueSignupPhoneOtp).not.toHaveBeenCalled()
  })

  it('refuses without the signup cookie: there is no user to bind the code to', async () => {
    readSignupUid.mockResolvedValue(null)
    expect(await resendSignupPhoneOtp(null, form({ phone: '050-1234567' }))).toMatchObject({
      error: expect.stringContaining('פג הזמן'),
    })
    expect(issueSignupPhoneOtp).not.toHaveBeenCalled()
  })

  it('reissues under the cookie user and answers the E.164 it used', async () => {
    expect(await resendSignupPhoneOtp(null, form({ phone: '050-1234567' }))).toEqual({
      success: E164,
    })
    expect(issueSignupPhoneOtp).toHaveBeenCalledWith({ e164: E164, userId: UID })
  })

  it('turns an issue failure into one Hebrew sentence', async () => {
    issueSignupPhoneOtp.mockResolvedValue({ ok: false, reason: 'send_failed' })
    expect(await resendSignupPhoneOtp(null, form({ phone: '050-1234567' }))).toEqual({
      error: 'שליחת הקוד נכשלה, נסו שוב',
    })
  })
})

describe('verifySignupPhone', () => {
  const valid = { phone: '050-1234567', token: '123456' }

  it('checks the ceiling before the store is read', async () => {
    checkRateLimit.mockResolvedValue(false)
    expect(await verifySignupPhone(null, form(valid))).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(verifyPhoneOtp).not.toHaveBeenCalled()
  })

  it('verifies under the signup purpose and reports each non-ok outcome', async () => {
    for (const result of ['wrong', 'expired', 'locked', 'unavailable'] as const) {
      verifyPhoneOtp.mockResolvedValueOnce({ result, userId: UID })
      const state = await verifySignupPhone(null, form(valid))
      expect(state).toMatchObject({ error: expect.any(String) })
    }
    expect(verifyPhoneOtp).toHaveBeenCalledWith({
      phone: E164,
      code: '123456',
      purpose: 'signup_phone',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('binds the phone to the user the challenge carries, stamps the profile, lands on confirm', async () => {
    await expect(verifySignupPhone(null, form({ ...valid, next: '/checkout' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    )
    expect(updateUserById).toHaveBeenCalledWith(UID, { phone: E164, phone_confirm: true })
    expect(profileUpdate).toHaveBeenCalledWith(
      { phone: E164, phone_verified_at: expect.any(String) },
      'id',
      UID,
    )
    expect(clearSignupUid).toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/signup/confirm?phone=verified&next=%2Fcheckout')
  })

  it('retries the profile stamp without the column while 254 is unapplied', async () => {
    profileUpdate
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column does not exist' } })
      .mockResolvedValueOnce({ error: null })
    await expect(verifySignupPhone(null, form(valid))).rejects.toThrow('NEXT_REDIRECT')
    expect(profileUpdate).toHaveBeenCalledTimes(2)
    expect(profileUpdate.mock.calls[1]?.[0]).toEqual({ phone: E164 })
    expect(logWarn).toHaveBeenCalledWith('db.optional_column_missing', {
      detail: expect.stringContaining('254_profiles_phone_verified_at.sql'),
    })
    expect(redirect).toHaveBeenCalledWith('/signup/confirm?phone=verified')
  })

  it('tells the customer when another account holds the number, and keeps the signup', async () => {
    updateUserById.mockResolvedValue({
      data: null,
      error: { message: 'A user with this phone number has already been registered' },
    })
    expect(await verifySignupPhone(null, form(valid))).toMatchObject({
      error: expect.stringContaining('כבר משויך לחשבון אחר'),
    })
    expect(profileUpdate).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledWith('auth.signup_phone_attach_failed', {
      reason: 'A user with this phone number has already been registered',
    })
  })

  it('refuses a challenge with no user id rather than attaching to nobody', async () => {
    verifyPhoneOtp.mockResolvedValue({ result: 'ok', userId: null })
    expect(await verifySignupPhone(null, form(valid))).toMatchObject({ error: expect.any(String) })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith('auth.signup_phone_challenge_without_user', {
      phone: E164,
    })
  })
})
