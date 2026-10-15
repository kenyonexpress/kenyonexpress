import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const logWarn = vi.fn()
const logInfo = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    warn: (...args: unknown[]) => logWarn(...args),
    info: (...args: unknown[]) => logInfo(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { payReferralIfReady } = await import('./pay')

const REFERRAL = '33333333-3333-4333-8333-333333333333'
const client = { rpc } as never

beforeEach(() => {
  rpc.mockReset()
  logWarn.mockReset()
  logInfo.mockReset()
})

describe('payReferralIfReady', () => {
  it('pays with no approver, so no person is named on a decision they did not make', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'paid' }, error: null })
    await payReferralIfReady(client, REFERRAL)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[0]).toBe('fn_pay_referral')
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_referral_id: REFERRAL, p_approved_by: null })
    expect(logInfo).toHaveBeenCalledWith('referrals.paid', { referralId: REFERRAL })
  })

  it('treats already_paid as a no-op, not a payment', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, reason: 'already_paid' }, error: null })
    await payReferralIfReady(client, REFERRAL)
    expect(logInfo).toHaveBeenCalledWith(
      'referrals.pay_noop',
      expect.objectContaining({ reason: 'already_paid' }),
    )
    expect(logInfo).not.toHaveBeenCalledWith('referrals.paid', expect.anything())
  })

  it('names the refusal when the payer refuses', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: 'no_referrer_wallet' }, error: null })
    await payReferralIfReady(client, REFERRAL)
    expect(logWarn).toHaveBeenCalledWith(
      'referrals.pay_refused',
      expect.objectContaining({ reason: 'no_referrer_wallet' }),
    )
  })

  it('does not throw when the rpc fails: the card is already charged', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'deadlock detected' } })
    await expect(payReferralIfReady(client, REFERRAL)).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalledWith('referrals.pay_failed', expect.anything())
  })
})
