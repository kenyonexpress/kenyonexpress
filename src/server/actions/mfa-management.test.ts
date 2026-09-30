import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The account page's three MFA calls, moved server-side when the session
 * cookie went HttpOnly (STEP 18). What can only fail here: the list is
 * empty for a signed-out caller rather than an error, the enrolment finish
 * shares the challenge core with the panel gate but does NOT redirect, and
 * an unenrol is shape-checked and limited before GoTrue sees it.
 */

const getUser = vi.fn()
const listFactors = vi.fn()
const unenroll = vi.fn()
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
        enroll: vi.fn(),
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
const FACTOR_ID = '22222222-2222-4222-8222-222222222222'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const { finishTotpEnrolment, listTotpFactors, unenrolTotpFactor } = await import('./mfa')

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockResolvedValue(true)
  listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null })
  unenroll.mockResolvedValue({ data: null, error: null })
  challenge.mockResolvedValue({ data: { id: 'chal-1' }, error: null })
  verify.mockResolvedValue({ data: {}, error: null })
})

describe('listTotpFactors', () => {
  it('is empty, not an error, for a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await listTotpFactors()).toEqual([])
    expect(listFactors).not.toHaveBeenCalled()
  })

  it('narrows each factor to id, status and name', async () => {
    listFactors.mockResolvedValue({
      data: {
        all: [],
        totp: [
          { id: 'f-1', status: 'verified', friendly_name: 'KenyonExpress admin', secret: 'x' },
          { id: 'f-2', status: 'unverified' },
        ],
      },
      error: null,
    })
    expect(await listTotpFactors()).toEqual([
      { id: 'f-1', status: 'verified', friendlyName: 'KenyonExpress admin' },
      { id: 'f-2', status: 'unverified', friendlyName: null },
    ])
  })

  it('logs a failed list and answers empty', async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: 'gotrue down' } })
    expect(await listTotpFactors()).toEqual([])
    expect(logWarn).toHaveBeenCalledWith('mfa.list_failed', { reason: 'gotrue down' })
  })
})

describe('finishTotpEnrolment', () => {
  const valid = { code: '123456', factor_id: FACTOR_ID }

  it('verifies through the same challenge core and stays on the page', async () => {
    expect(await finishTotpEnrolment(null, form(valid))).toEqual({ ok: true })
    expect(challenge).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    expect(verify).toHaveBeenCalledWith({
      factorId: FACTOR_ID,
      challengeId: 'chal-1',
      code: '123456',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('reports a wrong code with the shared sentence', async () => {
    verify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code' } })
    expect(await finishTotpEnrolment(null, form(valid))).toEqual({
      error: 'הקוד שגוי או שפג תוקפו, נסו שוב',
    })
  })

  it('is limited per user and per IP like the panel gate', async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('mfa-verify-ip:'))
    expect(await finishTotpEnrolment(null, form(valid))).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(challenge).not.toHaveBeenCalled()
  })
})

describe('unenrolTotpFactor', () => {
  it('refuses a signed-out caller and a spent bucket before GoTrue', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await unenrolTotpFactor(FACTOR_ID)).toEqual({
      error: 'צריך להתחבר כדי להגדיר אימות דו-שלבי',
    })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    checkRateLimit.mockResolvedValue(false)
    expect(await unenrolTotpFactor(FACTOR_ID)).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(checkRateLimit).toHaveBeenCalledWith(`mfa-unenrol:${USER_ID}`, 10, 3600)
    expect(unenroll).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a UUID without asking the provider', async () => {
    expect(await unenrolTotpFactor('not-a-factor')).toMatchObject({ error: expect.any(String) })
    expect(unenroll).not.toHaveBeenCalled()
  })

  it('removes the factor and reports a provider refusal in one sentence', async () => {
    expect(await unenrolTotpFactor(FACTOR_ID)).toEqual({ ok: true })
    expect(unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    unenroll.mockResolvedValue({ data: null, error: { message: 'AAL2 required' } })
    const result = await unenrolTotpFactor(FACTOR_ID)
    expect(result).toMatchObject({ error: expect.stringContaining('ההסרה נכשלה') })
    expect(logWarn).toHaveBeenCalledWith('mfa.unenrol_failed', { reason: 'AAL2 required' })
  })
})
