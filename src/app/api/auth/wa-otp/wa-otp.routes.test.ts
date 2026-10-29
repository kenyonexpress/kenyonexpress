import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = {
  enabled: true,
  rateOk: true,
  profiles: [{ id: 'u1', email: 'a@b.co' }] as { id: string; email: string | null }[],
  meta: { ok: true, messageId: 'wamid.1' } as Record<string, unknown>,
  inserted: [] as unknown[],
}
const rate = vi.fn(async () => state.rateOk)
const attempts: { kind: string; outcome: string }[] = []
const sendEmail = vi.fn(async () => ({ ok: true }))
const sendWhatsappOtp = vi.fn(async () => state.meta)

vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_n: string, h: unknown) => h,
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: rate,
  getClientIp: async () => '1.1.1.1',
}))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/whatsapp/meta-cloud', () => ({ sendWhatsappOtp }))
vi.mock('@/lib/auth/auth-fallback', () => ({ recordAuthAttempt: vi.fn() }))
vi.mock('@/server/auth/mint-session', () => ({ mintSessionFor: async () => ({ ok: true }) }))
vi.mock('@/server/verification/user-milestones', () => ({ markMilestoneVerified: vi.fn() }))
vi.mock('@/server/auth/wa-otp-gate', () => ({
  WA_OTP_SEND_LIMIT: 3,
  WA_OTP_SEND_WINDOW_SECONDS: 900,
  waOtpEnabled: async () => state.enabled,
  recordOtpAttempt: async (a: { kind: string; outcome: string }) => {
    attempts.push(a)
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => q
      q.limit = async () => ({ data: state.profiles, error: null })
      q.insert = async (row: unknown) => {
        if (table === 'auth_wa_otps') state.inserted.push(row)
        return { error: null }
      }
      return q
    },
  }),
}))

const { POST: send } = await import('./send/route')
const req = (body: unknown) =>
  new Request('http://x/api/auth/wa-otp/send', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never

beforeEach(() => {
  state.enabled = true
  state.rateOk = true
  state.profiles = [{ id: 'u1', email: 'a@b.co' }]
  state.meta = { ok: true, messageId: 'wamid.1' }
  state.inserted = []
  attempts.length = 0
  rate.mockClear()
  sendEmail.mockClear()
  sendWhatsappOtp.mockClear()
})

describe('POST /api/auth/wa-otp/send', () => {
  it('is dark (404) while wa_otp_enabled is off and sends nothing', async () => {
    state.enabled = false
    const res = await send(req({ phone: '0501234567' }))
    expect(res.status).toBe(404)
    expect(sendWhatsappOtp).not.toHaveBeenCalled()
    expect(state.inserted).toHaveLength(0)
  })

  it('sends over WhatsApp and stores only a hash', async () => {
    const res = await send(req({ phone: '0501234567' }))
    expect(res.status).toBe(200)
    expect((await res.json()).channel).toBe('whatsapp')
    expect(sendWhatsappOtp).toHaveBeenCalledOnce()
    const code = (sendWhatsappOtp.mock.calls[0] as unknown as string[])[1]
    expect(JSON.stringify(state.inserted)).not.toContain(code)
    expect(attempts).toEqual([expect.objectContaining({ kind: 'send', outcome: 'sent' })])
  })

  it('limits to 3 per 15 minutes per phone', async () => {
    await send(req({ phone: '0501234567' }))
    expect(rate).toHaveBeenCalledWith('wa-otp-send:+972501234567', 3, 900)
    state.rateOk = false
    const res = await send(req({ phone: '0501234567' }))
    expect(res.status).toBe(429)
    expect(attempts.at(-1)?.outcome).toBe('rate_limited')
  })

  it('falls back to email only when Meta rejects the template', async () => {
    state.meta = { ok: false, reason: 'meta_template_132001', templateRejected: true }
    const res = await send(req({ phone: '0501234567' }))
    expect((await res.json()).channel).toBe('email')
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(attempts.at(-1)?.outcome).toBe('fallback_email')
  })

  it('does not email on an ordinary Meta failure', async () => {
    state.meta = { ok: false, reason: 'meta_500' }
    await send(req({ phone: '0501234567' }))
    expect(sendEmail).not.toHaveBeenCalled()
    expect(attempts.at(-1)?.outcome).toBe('send_failed')
  })

  it('answers the same for an unknown number and sends nothing', async () => {
    state.profiles = []
    const res = await send(req({ phone: '0501234567' }))
    expect(res.status).toBe(200)
    expect(sendWhatsappOtp).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/wa-otp/verify', () => {
  it('is dark (404) while the flag is off', async () => {
    state.enabled = false
    const { POST: verify } = await import('./verify/route')
    const res = await verify(req({ phone: '0501234567', code: '123456' }))
    expect(res.status).toBe(404)
  })
})
