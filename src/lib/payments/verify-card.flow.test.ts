import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
const alarm = vi.fn()
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentAlarm: alarm }))

const writes: { table: string; op: string; row: unknown }[] = []
const verifyLowProfile = vi.fn()
const refundByTransactionId = vi.fn()
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: () => ({ name: 'mock', verifyLowProfile, refundByTransactionId }),
}))

let claim: {
  id: string
  profile_id: string
  status: string
  low_profile_code: string | null
  amount_agorot: number
} | null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (row: unknown) => {
        writes.push({ table, op: 'update', row })
        const chain: Promise<{ error: null }> & Record<string, unknown> = Object.assign(
          Promise.resolve({ error: null }),
          {
            eq: () => chain,
            select: () => chain,
            maybeSingle: async () => ({ data: claim, error: null }),
          },
        )
        return chain
      },
      insert: (row: unknown) => {
        writes.push({ table, op: 'insert', row })
        return { select: () => ({ single: async () => ({ data: { id: 'tok-1' }, error: null }) }) }
      },
    }),
  }),
}))

const { completeCardVerification, VERIFICATION_AMOUNT_AGOROT } = await import('./verify-card')

const okResult = {
  success: true,
  amountAgorot: 1,
  transactionId: 'tx-1',
  lowProfileId: 'lp-1',
  token: { token: 'T0K', last4: '4242', brand: 'visa', expiryMonth: 12, expiryYear: 2030 },
  raw: {},
}

describe('1 ILS verify flow (mock provider)', () => {
  beforeEach(() => {
    writes.length = 0
    vi.clearAllMocks()
    claim = {
      id: 'v1',
      profile_id: 'p1',
      status: 'processing',
      low_profile_code: 'lp-1',
      amount_agorot: 1,
    }
  })

  it('charges exactly 1 agora', () => {
    expect(VERIFICATION_AMOUNT_AGOROT).toBe(1)
  })

  it('stores the token on the profile and voids the charge', async () => {
    verifyLowProfile.mockResolvedValue(okResult)
    refundByTransactionId.mockResolvedValue({ success: true })
    expect(await completeCardVerification('v1')).toBe('verified')

    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-1', amountAgorot: 1, cancelOnly: true }),
    )
    const profile = writes.find((w) => w.table === 'profiles')
    expect(profile?.row).toEqual({
      saved_payment_method: expect.objectContaining({ token_id: 'tok-1', last_4: '4242' }),
    })
    const done = writes.filter((w) => w.table === 'payment_card_verifications').pop()
    expect(done?.row).toMatchObject({ status: 'verified', voided: true })
  })

  it('still verifies but raises an alarm when the void fails', async () => {
    verifyLowProfile.mockResolvedValue(okResult)
    refundByTransactionId.mockResolvedValue({ success: false })
    expect(await completeCardVerification('v1')).toBe('verified')
    expect(alarm).toHaveBeenCalled()
    const done = writes.filter((w) => w.table === 'payment_card_verifications').pop()
    expect(done?.row).toMatchObject({ voided: false })
  })

  it('fails on a declined card without storing a token', async () => {
    verifyLowProfile.mockResolvedValue({ ...okResult, success: false, token: undefined })
    expect(await completeCardVerification('v1')).toBe('failed')
    expect(writes.some((w) => w.table === 'payment_tokens')).toBe(false)
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('fails on an amount mismatch', async () => {
    verifyLowProfile.mockResolvedValue({ ...okResult, amountAgorot: 100 })
    expect(await completeCardVerification('v1')).toBe('failed')
    expect(writes.some((w) => w.table === 'payment_tokens')).toBe(false)
  })
})
