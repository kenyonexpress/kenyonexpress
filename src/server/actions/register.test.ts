import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The register panel's inline actions (UX24). What can only fail here: the
 * action answers with the NEXT STEP and never redirects (the stepper lives
 * on whatever page the shopper is on), a refused field says WHICH field so
 * the stepper can go back to it, the terms box is required before GoTrue is
 * touched and is stamped into the metadata when ticked, a code that went
 * out means the verify step and one that could not means the welcome, and
 * a verified code answers the welcome with the phone marked.
 */

type Fn = (...args: unknown[]) => Promise<unknown>
const checkRateLimit = vi.fn<Fn>(async () => true)
const signUp = vi.fn<Fn>()
const issueSignupPhoneOtp = vi.fn<Fn>()
const verifyPhoneOtp = vi.fn<Fn>()
const updateUserById = vi.fn<Fn>(async () => ({ error: null }))
const profileUpdate = vi.fn<Fn>(async () => ({ error: null }))
const redirect = vi.fn()

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signUp: (...a: unknown[]) => signUp(...a) } }),
}))
vi.mock('@/server/auth/signup-phone-otp', () => ({
  issueSignupPhoneOtp: (...a: unknown[]) => issueSignupPhoneOtp(...a),
  readSignupUid: async () => null,
  clearSignupUid: async () => {},
}))
vi.mock('@/lib/sms/otp', () => ({
  verifyPhoneOtp: (...a: unknown[]) => verifyPhoneOtp(...a),
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
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

import { registerAccount, verifyRegisterPhone } from './register'

const CREATED = { id: '11111111-1111-4111-8111-111111111111', identities: [{ id: 'i-1' }] }

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID = {
  full_name: 'דנה כהן',
  email: 'Dana@Example.com',
  phone: '050-123-4567',
  password: 'secret12',
  accept_terms: 'on',
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  signUp.mockResolvedValue({ data: { user: CREATED }, error: null })
  issueSignupPhoneOtp.mockResolvedValue({ ok: false, reason: 'sms_unavailable' })
})

describe('registerAccount', () => {
  it('answers the welcome, not a redirect, when no code could go out', async () => {
    expect(await registerAccount(null, form({ ...VALID, next: '/cart' }))).toEqual({
      step: 'welcome',
      phoneVerified: false,
      email: 'dana@example.com',
      next: '/cart',
    })
    expect(redirect).not.toHaveBeenCalled()
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          data: expect.objectContaining({
            full_name: 'דנה כהן',
            terms_version: '1.1',
            privacy_version: '2.1',
            terms_accepted_at: expect.any(String),
          }),
        },
      }),
    )
  })

  it('answers the verify step with the number a code went to', async () => {
    issueSignupPhoneOtp.mockResolvedValue({ ok: true, to: '+972501234567', expiresAt: 'x' })
    expect(await registerAccount(null, form(VALID))).toEqual({
      step: 'verify',
      phone: '+972501234567',
      email: 'dana@example.com',
      next: null,
    })
    expect(issueSignupPhoneOtp).toHaveBeenCalledWith({ e164: '+972501234567', userId: CREATED.id })
  })

  it('names the field it refused so the stepper can return to it', async () => {
    expect(await registerAccount(null, form({ ...VALID, email: 'nope' }))).toEqual({
      error: 'כתובת אימייל לא תקינה',
      field: 'email',
    })
    expect(await registerAccount(null, form({ ...VALID, phone: '12' }))).toEqual({
      error: 'מספר טלפון ישראלי לא תקין (לדוגמה: 050-1234567)',
      field: 'phone',
    })
    const { accept_terms: _omitted, ...unticked } = VALID
    expect(await registerAccount(null, form(unticked))).toEqual({
      error: 'כדי להירשם יש לאשר את תנאי השימוש ומדיניות הפרטיות',
      field: 'accept_terms',
    })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('refuses under the ceiling and maps GoTrue’s duplicate, with no field', async () => {
    checkRateLimit.mockResolvedValueOnce(false)
    expect(await registerAccount(null, form(VALID))).toEqual({
      error: 'יותר מדי ניסיונות הרשמה — נסו שוב בעוד שעה',
      field: undefined,
    })
    signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    expect(await registerAccount(null, form(VALID))).toEqual({
      error: 'כתובת האימייל כבר רשומה במערכת',
      field: undefined,
    })
  })

  it('never texts the placeholder user a duplicate address gets, and still welcomes', async () => {
    signUp.mockResolvedValue({ data: { user: { ...CREATED, identities: [] } }, error: null })
    const state = await registerAccount(null, form(VALID))
    expect(state).toMatchObject({ step: 'welcome', phoneVerified: false })
    expect(issueSignupPhoneOtp).not.toHaveBeenCalled()
  })
})

describe('verifyRegisterPhone', () => {
  it('answers the welcome with the phone marked, carrying the email and next', async () => {
    verifyPhoneOtp.mockResolvedValue({ result: 'ok', userId: CREATED.id })
    expect(
      await verifyRegisterPhone(
        null,
        form({ phone: '+972501234567', token: '123456', email: 'dana@example.com', next: '/cart' }),
      ),
    ).toEqual({ step: 'welcome', phoneVerified: true, email: 'dana@example.com', next: '/cart' })
    expect(updateUserById).toHaveBeenCalledWith(CREATED.id, {
      phone: '+972501234567',
      phone_confirm: true,
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('answers a wrong code with the sentence and no step', async () => {
    verifyPhoneOtp.mockResolvedValue({ result: 'wrong', userId: CREATED.id })
    expect(
      await verifyRegisterPhone(null, form({ phone: '+972501234567', token: '000000' })),
    ).toEqual({ error: 'הקוד שגוי, נסו שוב' })
  })
})
