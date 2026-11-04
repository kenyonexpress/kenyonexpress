import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn(async (_key: string, ..._rest: number[]) => true))
const cookieJar = vi.hoisted(() => new Map<string, string>())
const signInWithOtp = vi.hoisted(() => vi.fn(async () => ({ error: null })))
const verifyOtp = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
const profileRows = vi.hoisted(() => ({
  rows: [] as { id: string; phone: string; email: string }[],
}))
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true, id: 'm1' })))
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  }),
)

vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp: async () => '1.2.3.4' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOtp, verifyOtp } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink } },
    from: () => ({
      select: () => ({ ilike: () => ({ limit: async () => ({ data: profileRows.rows }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_guest',
  getGuestSessionId: async () => null,
}))
vi.mock('@/server/actions/cart', () => ({ mergeGuestCart: vi.fn(async () => false) }))
vi.mock('@/server/analytics/track', () => ({ identifyPostHogUser: vi.fn() }))
vi.mock('@/server/referrals/claim', () => ({ claimReferralOnce: vi.fn() }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_: string, fn: () => unknown) => fn(),
}))

import { sendSignInCode, verifySignInCode } from './otp-sign-in'

const WA_ENV = {
  WHATSAPP_CLOUD_TOKEN: 'EAAGtoken',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_OTP_SECRET: 'x'.repeat(40),
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

let graphBodies: { template: { components: { parameters: { text: string }[] }[] } }[] = []

beforeEach(() => {
  cookieJar.clear()
  graphBodies = []
  profileRows.rows = []
  checkRateLimit.mockClear()
  signInWithOtp.mockClear()
  verifyOtp.mockReset()
  generateLink.mockReset()
  sendEmail.mockClear()
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      graphBodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('email fallback when WhatsApp env is missing', () => {
  it('sends the code by email through Supabase, and Graph is never called', async () => {
    for (const key of Object.keys(WA_ENV)) vi.stubEnv(key, '')
    const result = await sendSignInCode(null, form({ email: 'Dana@Example.com' }))
    expect(result).toEqual({ sent: true, channel: 'email', to: 'dana@example.com' })
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'dana@example.com' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the branded mail with the generated email_otp when Resend is set', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    generateLink.mockResolvedValue({ data: { properties: { email_otp: '908172' } }, error: null })
    const result = await sendSignInCode(null, form({ email: 'dana@example.com' }))
    expect(result).toMatchObject({ sent: true, channel: 'email' })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dana@example.com',
        subject: expect.stringContaining('908172'),
      }),
    )
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('verifies the email code and redirects to the safe next path', async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    await expect(
      verifySignInCode(
        null,
        form({ channel: 'email', email: 'dana@example.com', token: '123456', next: '/account' }),
      ),
    ).rejects.toMatchObject({ to: '/account' })
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'dana@example.com',
      token: '123456',
      type: 'email',
    })
    expect(checkRateLimit).toHaveBeenCalledWith('otp-verify-email:dana@example.com', 5, 3600)
  })

  it('refuses a wrong email code in Hebrew', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    })
    const result = await verifySignInCode(
      null,
      form({ channel: 'email', email: 'd@example.com', token: '000000' }),
    )
    expect(result).toEqual({ error: 'הקוד שגוי או שפג תוקפו' })
  })
})

describe('WhatsApp through Meta Cloud API', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(WA_ENV)) vi.stubEnv(key, value)
  })

  async function sendAndReadCode(): Promise<string> {
    const result = await sendSignInCode(null, form({ phone: '050-123-4567' }))
    expect(result).toEqual({ sent: true, channel: 'whatsapp', to: '+972501234567' })
    const code = graphBodies[0]?.template.components[0]?.parameters[0]?.text
    if (!code) throw new Error('no code sent')
    return code
  }

  it('sends a template message and sets the signed challenge cookie', async () => {
    const code = await sendAndReadCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(cookieJar.get('ke_otp_challenge')).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(cookieJar.get('ke_otp_challenge')).not.toContain(code)
  })

  it('refuses a landline before spending a message', async () => {
    const result = await sendSignInCode(null, form({ phone: '03-1234567' }))
    expect(result).toEqual({ error: 'יש להזין מספר נייד ישראלי (05X)' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers the email fallback when Graph refuses the send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"code":131026}}', { status: 400 })),
    )
    const result = await sendSignInCode(null, form({ phone: '0501234567' }))
    expect(result).toMatchObject({ fallback: 'email' })
    expect(cookieJar.has('ke_otp_challenge')).toBe(false)
  })

  it('takes the email leg when the customer chose the fallback', async () => {
    const result = await sendSignInCode(null, form({ channel: 'email', email: 'd@example.com' }))
    expect(result).toMatchObject({ sent: true, channel: 'email' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens the owning account through a minted magic-link token', async () => {
    profileRows.rows = [{ id: 'u7', phone: '050-1234567', email: 'owner@example.com' }]
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hash-1' } },
      error: null,
    })
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u7' } }, error: null })
    const code = await sendAndReadCode()

    await expect(
      verifySignInCode(null, form({ channel: 'whatsapp', phone: '+972501234567', token: code })),
    ).rejects.toMatchObject({ to: '/' })
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'owner@example.com' })
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'magiclink' })
    // Single use.
    expect(cookieJar.has('ke_otp_challenge')).toBe(false)
  })

  it('refuses a wrong code and mints nothing', async () => {
    const code = await sendAndReadCode()
    const wrong = code === '000000' ? '000001' : '000000'
    const result = await verifySignInCode(
      null,
      form({ channel: 'whatsapp', phone: '+972501234567', token: wrong }),
    )
    expect(result).toEqual({ error: 'הקוד שגוי או שפג תוקפו' })
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('refuses a code sent to a different number', async () => {
    const code = await sendAndReadCode()
    const result = await verifySignInCode(
      null,
      form({ channel: 'whatsapp', phone: '+972509999999', token: code }),
    )
    expect(result).toEqual({ error: 'הקוד שגוי או שפג תוקפו' })
  })

  it('creates no account for an unknown number and points at email', async () => {
    const code = await sendAndReadCode()
    const result = await verifySignInCode(
      null,
      form({ channel: 'whatsapp', phone: '+972501234567', token: code }),
    )
    expect(result).toMatchObject({ fallback: 'email' })
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('refuses to pick between two accounts on one number', async () => {
    profileRows.rows = [
      { id: 'a', phone: '0501234567', email: 'a@example.com' },
      { id: 'b', phone: '+972 50 123 4567', email: 'b@example.com' },
    ]
    const code = await sendAndReadCode()
    const result = await verifySignInCode(
      null,
      form({ channel: 'whatsapp', phone: '+972501234567', token: code }),
    )
    expect(result).toEqual({
      error: 'המספר הזה רשום ביותר מחשבון אחד. היכנסו עם אימייל',
      fallback: 'email',
    })
  })

  it('bounds guesses per number', async () => {
    checkRateLimit.mockImplementation(
      async (key: string) => !key.startsWith('phone-verify-number:'),
    )
    const result = await verifySignInCode(
      null,
      form({ channel: 'whatsapp', phone: '+972501234567', token: '123456' }),
    )
    expect(result).toEqual({ error: 'יותר מדי ניסיונות למספר הזה, בקשו קוד חדש בעוד שעה' })
    checkRateLimit.mockImplementation(async () => true)
  })
})
