import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The claim and leave actions (STEP 61). Pinned: a malformed id or quantity
 * is refused before any read; a guest is told to sign in and nothing is
 * written; the limiter is per user; the RPC's outcome is translated and its
 * claim shape passed through; `held` and `queued` are ok, every refusal is
 * not; an absent function names the migration softly; an RPC error is a
 * generic message, never a throw.
 */

const mock = vi.hoisted(() => ({
  user: null as { id: string } | null,
  checkRateLimit: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mock.checkRateLimit,
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mock.rpc }),
}))
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidatePath }))

import { claimFlashSale, leaveFlashSale } from './flash-sales'

const SALE = '11111111-1111-4111-8111-111111111111'
const USER = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  mock.user = { id: USER }
  mock.checkRateLimit.mockReset()
  mock.checkRateLimit.mockResolvedValue(true)
  mock.rpc.mockReset()
  mock.revalidatePath.mockReset()
})

describe('claimFlashSale', () => {
  it('refuses a malformed id and a bad quantity without any read', async () => {
    const bad = await claimFlashSale('not-a-uuid', 1)
    expect(bad.ok).toBe(false)
    expect(bad.outcome).toBe('not_found')
    const qty = await claimFlashSale(SALE, 0)
    expect(qty.outcome).toBe('bad_quantity')
    const big = await claimFlashSale(SALE, 11)
    expect(big.outcome).toBe('bad_quantity')
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('tells a guest to sign in and writes nothing', async () => {
    mock.user = null
    const result = await claimFlashSale(SALE, 1)
    expect(result).toMatchObject({ ok: false, outcome: 'guest' })
    expect(result.message).toMatch(/להתחבר/)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.checkRateLimit).not.toHaveBeenCalled()
  })

  it('limits per user, not per address', async () => {
    mock.checkRateLimit.mockResolvedValue(false)
    const result = await claimFlashSale(SALE, 1)
    expect(result.ok).toBe(false)
    expect(result.outcome).toBe('error')
    expect(mock.checkRateLimit).toHaveBeenCalledWith(`flash-claim:${USER}`, 30, 3600)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('passes a held outcome through with its expiry and refreshes the cart', async () => {
    mock.rpc.mockResolvedValue({
      data: [
        {
          outcome: 'held',
          status: 'held',
          quantity: '2',
          queue_position: null,
          ahead: null,
          expires_at: '2026-10-08T12:10:00Z',
          remaining: '7',
        },
      ],
      error: null,
    })
    const result = await claimFlashSale(SALE, 2)
    expect(mock.rpc).toHaveBeenCalledWith('claim_flash_sale', {
      p_sale: SALE,
      p_user: USER,
      p_quantity: 2,
    })
    expect(result.ok).toBe(true)
    expect(result.outcome).toBe('held')
    expect(result.claim).toEqual({
      status: 'held',
      quantity: 2,
      position: null,
      ahead: null,
      expires_at: '2026-10-08T12:10:00Z',
    })
    expect(result.remaining).toBe(7)
    expect(mock.revalidatePath).toHaveBeenCalledWith('/cart')
  })

  it('reports a queued outcome as ok with the count ahead, and does not touch the cart', async () => {
    mock.rpc.mockResolvedValue({
      data: [
        {
          outcome: 'queued',
          status: 'queued',
          quantity: 1,
          queue_position: 4,
          ahead: 3,
          expires_at: null,
          remaining: 0,
        },
      ],
      error: null,
    })
    const result = await claimFlashSale(SALE, 1)
    expect(result.ok).toBe(true)
    expect(result.outcome).toBe('queued')
    expect(result.claim?.ahead).toBe(3)
    expect(result.message).toMatch(/חדר ההמתנה/)
    expect(mock.revalidatePath).not.toHaveBeenCalled()
  })

  it('translates each refusal and marks it not ok', async () => {
    for (const outcome of ['ended', 'not_started', 'inactive', 'not_found', 'consumed']) {
      mock.rpc.mockResolvedValue({ data: [{ outcome }], error: null })
      const result = await claimFlashSale(SALE, 1)
      expect(result.ok).toBe(false)
      expect(result.outcome).toBe(outcome)
      expect(result.message).toMatch(/[֐-׿]/)
    }
  })

  it('names the migration softly when the function is absent, and is generic on any other error', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'no function' } })
    const absent = await claimFlashSale(SALE, 1)
    expect(absent.ok).toBe(false)
    expect(absent.message).toMatch(/עדיין לא פתוח/)

    mock.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'terminated' } })
    const failed = await claimFlashSale(SALE, 1)
    expect(failed.ok).toBe(false)
    expect(failed.outcome).toBe('error')
    expect(failed.message).not.toMatch(/terminated/)
  })

  it('treats an unexpected outcome as an error rather than a success', async () => {
    mock.rpc.mockResolvedValue({ data: [{ outcome: 'surprise' }], error: null })
    const result = await claimFlashSale(SALE, 1)
    expect(result.ok).toBe(false)
    expect(result.outcome).toBe('error')
  })
})

describe('leaveFlashSale', () => {
  it('requires a session and a well-formed id', async () => {
    expect((await leaveFlashSale('nope')).ok).toBe(false)
    mock.user = null
    expect((await leaveFlashSale(SALE)).ok).toBe(false)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('releases through the RPC and says whether anything was given back', async () => {
    mock.rpc.mockResolvedValue({ data: true, error: null })
    const left = await leaveFlashSale(SALE)
    expect(mock.rpc).toHaveBeenCalledWith('leave_flash_sale', { p_sale: SALE, p_user: USER })
    expect(left.ok).toBe(true)
    expect(left.message).toMatch(/חזרה למלאי/)

    mock.rpc.mockResolvedValue({ data: false, error: null })
    const nothing = await leaveFlashSale(SALE)
    expect(nothing.ok).toBe(true)
    expect(nothing.message).toMatch(/לא הייתה/)
  })
})
