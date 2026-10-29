import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = { enabled: false }
const getUser = vi.fn()
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_n: string, h: unknown) => h,
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/payments/card-verify-gate', () => ({ cardVerifyEnabled: async () => state.enabled }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit: async () => true }))
vi.mock('@/lib/payments', () => ({ getPaymentProvider: vi.fn(), loadCardcomEnv: vi.fn() }))
vi.mock('@/lib/payments/verify-card', () => ({
  VERIFICATION_AMOUNT_AGOROT: 1,
  completeCardVerification: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

const { POST } = await import('./route')

describe('POST /api/payments/verify-card gate', () => {
  beforeEach(() => {
    getUser.mockReset()
  })

  it('returns 503 when card_verify_enabled is off, before touching auth', async () => {
    state.enabled = false
    const res = await POST(
      new Request('http://x/api/payments/verify-card', { method: 'POST' }) as never,
    )
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'verification_disabled' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('requires a user when the flag is on', async () => {
    state.enabled = true
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request('http://x/api/payments/verify-card', { method: 'POST' }) as never,
    )
    expect(res.status).toBe(401)
  })
})
