import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * TOTP enrolment and verification over Supabase-native MFA. What can only
 * fail here: that abandoned unverified TOTP factors are removed before a new
 * enrol (and verified or phone factors are not), that a 6-digit code is
 * challenged and verified against the named factor, that both limiters
 * (per user, per IP) gate the guess, and that success lands in the panel.
 */

const getUser = vi.fn()
const listFactors = vi.fn()
const unenroll = vi.fn()
const enroll = vi.fn()
const challenge = vi.fn()
const verify = vi.fn()
const checkRateLimit = vi.fn()
const redirect = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: () => getUser(),
      mfa: {
        listFactors: () => listFactors(),
        unenroll: (input: unknown) => unenroll(input),
        enroll: (input: unknown) => enroll(input),
        challenge: (input: unknown) => challenge(input),
        verify: (input: unknown) => verify(input),
      },
    },
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    redirect(path)
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const NOT_SIGNED_IN = 'צריך להתחבר כדי להגדיר אימות דו-שלבי'
const RATE_LIMITED = 'יותר מדי ניסיונות, נסו שוב בעוד שעה'
const BAD_CODE = 'הקוד שגוי או שפג תוקפו, נסו שוב'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const { startTotpEnrolment, verifyTotpCode } = await import('./mfa')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockResolvedValue(true)
  listFactors.mockResolvedValue({ data: { all: [] } })
  unenroll.mockResolvedValue({ data: null, error: null })
  enroll.mockResolvedValue({
    data: { id: 'factor-1', totp: { qr_code: '<svg/>', secret: 'JBSWY3DP' } },
    error: null,
  })
  challenge.mockResolvedValue({ data: { id: 'chal-1' }, error: null })
  verify.mockResolvedValue({ data: {}, error: null })
})

describe('startTotpEnrolment', () => {
  it('refuses a signed-out or rate-limited caller before touching MFA', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await startTotpEnrolment()).toEqual({ error: NOT_SIGNED_IN })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    checkRateLimit.mockResolvedValue(false)
    expect(await startTotpEnrolment()).toEqual({ error: RATE_LIMITED })
    expect(checkRateLimit).toHaveBeenCalledWith(`mfa-enrol:${USER_ID}`, 10, 3600)
    expect(listFactors).not.toHaveBeenCalled()
    expect(enroll).not.toHaveBeenCalled()
  })

  it('removes only abandoned TOTP factors, then enrols and hands back the secret', async () => {
    listFactors.mockResolvedValue({
      data: {
        all: [
          { id: 'old-1', factor_type: 'totp', status: 'unverified' },
          { id: 'live', factor_type: 'totp', status: 'verified' },
          { id: 'phone', factor_type: 'phone', status: 'unverified' },
          { id: 'old-2', factor_type: 'totp', status: 'unverified' },
        ],
      },
    })
    expect(await startTotpEnrolment()).toEqual({
      factorId: 'factor-1',
      qrSvg: '<svg/>',
      secret: 'JBSWY3DP',
    })
    expect(unenroll.mock.calls).toEqual([[{ factorId: 'old-1' }], [{ factorId: 'old-2' }]])
    expect(enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'KenyonExpress admin' })
  })

  it('tolerates a factor list that did not answer', async () => {
    listFactors.mockResolvedValue({ data: null })
    expect(await startTotpEnrolment()).toMatchObject({ factorId: 'factor-1' })
    expect(unenroll).not.toHaveBeenCalled()
  })

  it('reports a failed enrol with one sentence and logs the reason', async () => {
    enroll.mockResolvedValue({ data: null, error: { message: 'gotrue down' } })
    expect(await startTotpEnrolment()).toEqual({ error: 'הגדרת האימות הדו-שלבי נכשלה, נסו שוב' })
    expect(logWarn).toHaveBeenCalledWith('mfa.enrol_failed', { reason: 'gotrue down' })
    enroll.mockResolvedValue({ data: null, error: null })
    expect(await startTotpEnrolment()).toEqual({ error: 'הגדרת האימות הדו-שלבי נכשלה, נסו שוב' })
    expect(logWarn).toHaveBeenCalledWith('mfa.enrol_failed', { reason: 'no data' })
  })
})

describe('verifyTotpCode', () => {
  const valid = { code: ' 123456 ', factor_id: 'factor-1' }

  it('refuses a signed-out caller before the limiters', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: NOT_SIGNED_IN })
    expect(checkRateLimit).not.toHaveBeenCalled()
  })

  it('stops when either the per-user or the per-IP bucket is spent', async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('mfa-verify:'))
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: RATE_LIMITED })
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('mfa-verify-ip:'))
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: RATE_LIMITED })
    expect(checkRateLimit).toHaveBeenCalledWith(`mfa-verify:${USER_ID}`, 10, 900)
    expect(checkRateLimit).toHaveBeenCalledWith('mfa-verify-ip:203.0.113.9', 30, 900)
    expect(challenge).not.toHaveBeenCalled()
  })

  it('rejects anything that is not six digits with a factor, without a challenge', async () => {
    expect(await verifyTotpCode(null, form({ code: '12345', factor_id: 'f' }))).toEqual({
      error: BAD_CODE,
    })
    expect(await verifyTotpCode(null, form({ code: '123456' }))).toEqual({ error: BAD_CODE })
    expect(challenge).not.toHaveBeenCalled()
  })

  it('answers the same sentence for a failed challenge and a wrong code, and logs why', async () => {
    challenge.mockResolvedValue({ data: null, error: { message: 'no factor' } })
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: BAD_CODE })
    expect(logWarn).toHaveBeenCalledWith('mfa.challenge_failed', { reason: 'no factor' })
    expect(verify).not.toHaveBeenCalled()

    challenge.mockResolvedValue({ data: null, error: null })
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: BAD_CODE })
    expect(logWarn).toHaveBeenCalledWith('mfa.challenge_failed', { reason: 'no data' })

    challenge.mockResolvedValue({ data: { id: 'chal-1' }, error: null })
    verify.mockResolvedValue({ data: null, error: { message: 'invalid code' } })
    expect(await verifyTotpCode(null, form(valid))).toEqual({ error: BAD_CODE })
    expect(logWarn).toHaveBeenCalledWith('mfa.verify_failed', { reason: 'invalid code' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('challenges and verifies the named factor with the trimmed code, then lands in the panel', async () => {
    await expect(verifyTotpCode(null, form(valid))).rejects.toThrow('NEXT_REDIRECT:/admin')
    expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-1' })
    expect(verify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      challengeId: 'chal-1',
      code: '123456',
    })
    expect(redirect).toHaveBeenCalledWith('/admin')
  })
})
