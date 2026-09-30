import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The glue between `signUp` and the code screen. What can only fail here:
 * the challenge is issued under the signup purpose with the new user id
 * bound in, the id cookie is written ONLY after a code actually went out
 * (a cookie with no challenge behind it would let the resend button text
 * a stranger), and the cookie is HttpOnly.
 */

const issuePhoneOtp = vi.fn()
const cookieSet = vi.fn()
const cookieGet = vi.fn()
const cookieDelete = vi.fn()
const logInfo = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/sms/otp', () => ({ issuePhoneOtp: (...a: unknown[]) => issuePhoneOtp(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (...a: unknown[]) => cookieSet(...a),
    get: (name: string) => cookieGet(name),
    delete: (...a: unknown[]) => cookieDelete(...a),
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    info: (...a: unknown[]) => logInfo(...a),
    warn: (...a: unknown[]) => logWarn(...a),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { clearSignupUid, issueSignupPhoneOtp, readSignupUid } from './signup-phone-otp'

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
})

describe('issueSignupPhoneOtp', () => {
  it('issues under the signup purpose with the user id bound in, then writes the cookie', async () => {
    issuePhoneOtp.mockResolvedValue({ ok: true, to: '+972501234567', expiresAt: 'x', segments: 1 })
    const outcome = await issueSignupPhoneOtp({ e164: '+972501234567', userId: UID })
    expect(outcome.ok).toBe(true)
    expect(issuePhoneOtp).toHaveBeenCalledWith(
      { admin: true },
      { phone: '+972501234567', userId: UID, purpose: 'signup_phone' },
    )
    expect(cookieSet).toHaveBeenCalledWith('ke_signup_uid', UID, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 900,
    })
  })

  it('writes no cookie when no code went out, and logs the skip at info when SMS is simply off', async () => {
    issuePhoneOtp.mockResolvedValue({ ok: false, reason: 'sms_unavailable', detail: 'unset' })
    const outcome = await issueSignupPhoneOtp({ e164: '+972501234567', userId: UID })
    expect(outcome).toMatchObject({ ok: false, reason: 'sms_unavailable' })
    expect(cookieSet).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledWith('auth.signup_phone_otp_skipped', {
      reason: 'sms_unavailable',
      detail: 'unset',
    })
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('warns, not info, when a configured send fails', async () => {
    issuePhoneOtp.mockResolvedValue({ ok: false, reason: 'send_failed', detail: 'twilio 500' })
    await issueSignupPhoneOtp({ e164: '+972501234567', userId: UID })
    expect(logWarn).toHaveBeenCalledWith('auth.signup_phone_otp_skipped', {
      reason: 'send_failed',
      detail: 'twilio 500',
    })
  })

  it('drops Secure on an http origin so the local build can complete a signup', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3311')
    issuePhoneOtp.mockResolvedValue({ ok: true, to: '+972501234567', expiresAt: 'x', segments: 1 })
    await issueSignupPhoneOtp({ e164: '+972501234567', userId: UID })
    expect(cookieSet.mock.calls[0]?.[2]).toMatchObject({ secure: false, httpOnly: true })
  })
})

describe('readSignupUid', () => {
  it('accepts only a UUID', async () => {
    cookieGet.mockReturnValue({ value: UID })
    expect(await readSignupUid()).toBe(UID)
    cookieGet.mockReturnValue({ value: 'not-a-uuid' })
    expect(await readSignupUid()).toBeNull()
    cookieGet.mockReturnValue(undefined)
    expect(await readSignupUid()).toBeNull()
  })
})

describe('clearSignupUid', () => {
  it('deletes the cookie', async () => {
    await clearSignupUid()
    expect(cookieDelete).toHaveBeenCalledWith('ke_signup_uid')
  })
})
