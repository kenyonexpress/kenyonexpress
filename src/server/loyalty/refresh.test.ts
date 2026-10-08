import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const logInfo = vi.fn()
const logWarn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    info: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { refreshLoyaltyTierForOrder } from './refresh'

const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '11111111-1111-4111-8111-111111111111'

function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as never
}

describe('refreshLoyaltyTierForOrder', () => {
  it('calls the one RPC with the user id and reports what it decided', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        tier: 'silver',
        previous_tier: 'bronze',
        spend_12m_agorot: 148000,
        upgraded: true,
      },
      error: null,
    })
    const out = await refreshLoyaltyTierForOrder(client(rpc), { orderId: ORDER, userId: USER })
    expect(rpc).toHaveBeenCalledWith('fn_refresh_loyalty_tier', { p_user_id: USER })
    expect(out).toEqual({
      status: 'refreshed',
      tier: 'silver',
      previousTier: 'bronze',
      upgraded: true,
    })
    expect(logInfo).toHaveBeenCalledWith('loyalty.refresh_result', {
      orderId: ORDER,
      tier: 'silver',
      upgraded: true,
    })
  })

  it('treats a missing function as 261 not applied: info, not a warning, nothing thrown', async () => {
    for (const code of ['PGRST202', '42883']) {
      logWarn.mockClear()
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: 'missing' } })
      const out = await refreshLoyaltyTierForOrder(client(rpc), { orderId: ORDER, userId: USER })
      expect(out).toEqual({ status: 'not_applied' })
      expect(logWarn).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledWith(
        'loyalty.refresh_not_applied',
        expect.objectContaining({ hint: expect.stringContaining('261') }),
      )
    }
  })

  it('logs and returns on any other error, and never throws past the finalize', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(
      refreshLoyaltyTierForOrder(client(rpc), { orderId: ORDER, userId: USER }),
    ).resolves.toEqual({ status: 'failed' })
    expect(logWarn).toHaveBeenCalledWith('loyalty.refresh_failed', {
      orderId: ORDER,
      reason: 'timeout',
    })

    const thrower = vi.fn().mockRejectedValue(new Error('network'))
    await expect(
      refreshLoyaltyTierForOrder(client(thrower), { orderId: ORDER, userId: USER }),
    ).resolves.toEqual({ status: 'failed' })
  })

  it('does nothing for an order with no account behind it', async () => {
    const rpc = vi.fn()
    const out = await refreshLoyaltyTierForOrder(client(rpc), { orderId: ORDER, userId: null })
    expect(out).toEqual({ status: 'not_applied' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('wiring', () => {
  const finalize = readFileSync(resolve(process.cwd(), 'src/server/payments/finalize.ts'), 'utf8')

  it('is called from the payment finalize after the referral, before the stock consumption', () => {
    expect(finalize).toContain("from '@/server/loyalty/refresh'")
    const referral = finalize.indexOf('await completeReferralForOrder(')
    const loyalty = finalize.indexOf('await refreshLoyaltyTierForOrder(')
    const stock = finalize.indexOf("admin.rpc('consume_order_stock'")
    expect(referral).toBeGreaterThan(0)
    expect(loyalty).toBeGreaterThan(referral)
    expect(stock).toBeGreaterThan(loyalty)
  })

  it('keeps the RPC name out of finalize.ts itself, where the schema contract scrapes', () => {
    // finalize-schema-contract.test.ts checks every RPC named IN finalize.ts
    // against HOSTED_RPCS, which lists what production has today. The call
    // lives here, behind a function, because the function does not exist in
    // production until 261 and the contract is about what does.
    expect(finalize).not.toContain('fn_refresh_loyalty_tier')
  })
})
