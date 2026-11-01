import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

let row: { bool_value: boolean | null } | null = null
let failure: Error | null = null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      if (failure) throw failure
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: row, error: null })
      return q
    },
  }),
}))

const { waOtpEnabled, WA_OTP_SEND_LIMIT, WA_OTP_SEND_WINDOW_SECONDS } = await import(
  './wa-otp-gate'
)
const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv

beforeEach(() => {
  row = null
  failure = null
})

describe('wa_otp_enabled', () => {
  it('is off by default (no row)', async () => expect(await waOtpEnabled(env())).toBe(false))
  it('is off when the row is false or null', async () => {
    row = { bool_value: false }
    expect(await waOtpEnabled(env())).toBe(false)
    row = { bool_value: null }
    expect(await waOtpEnabled(env())).toBe(false)
  })
  it('is on when the row is true', async () => {
    row = { bool_value: true }
    expect(await waOtpEnabled(env())).toBe(true)
  })
  it('fails closed when the read throws', async () => {
    failure = new Error('db down')
    expect(await waOtpEnabled(env())).toBe(false)
  })
  it('FLAG_WA_OTP_ENABLED overrides', async () => {
    expect(await waOtpEnabled(env({ FLAG_WA_OTP_ENABLED: 'true' }))).toBe(true)
  })
})

describe('limits', () => {
  it('is 3 per 15 minutes', () => {
    expect(WA_OTP_SEND_LIMIT).toBe(3)
    expect(WA_OTP_SEND_WINDOW_SECONDS).toBe(900)
  })
})
