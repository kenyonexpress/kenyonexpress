import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin's decision. It moves no money: approve hands the row to the
 * path its destination names, reject closes it and mails the customer.
 * What can only fail here is that routing, the fee flag derived from the
 * customer's reason code (and overridden by waiveFee), the CAS on reject,
 * and the refusals for a row that is not decidable.
 */

const REFUND_ID = '8f3c2a1b-7d6e-4f50-9a1b-2c3d4e5f6a7b'
const ORDER = '11111111-1111-4111-8111-111111111111'

const requireAdminSession = vi.hoisted(() => vi.fn())
const refundOrder = vi.hoisted(() => vi.fn())
const refundToWallet = vi.hoisted(() => vi.fn())
const sendEmail = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
const refundsRead = vi.hoisted(() => vi.fn())
const refundsUpdate = vi.hoisted(() => vi.fn())
const updateChain = vi.hoisted(() => [] as unknown[][])
const auditInsert = vi.hoisted(() => vi.fn())
const profileRead = vi.hoisted(() => vi.fn())

vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'refunds') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => refundsRead() }) }),
          update: (payload: unknown) => {
            updateChain.length = 0
            updateChain.push(['update', payload])
            const q = {
              eq: (c: string, v: unknown) => {
                updateChain.push(['eq', c, v])
                return q
              },
              in: (c: string, v: unknown) => {
                updateChain.push(['in', c, v])
                return q
              },
              select: () => refundsUpdate(),
            }
            return q
          },
        }
      }
      if (table === 'audit_log') return { insert: (payload: unknown) => auditInsert(payload) }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => profileRead() }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/server/actions/payments/refund', () => ({ refundOrder }))
vi.mock('@/server/actions/payments/refund-wallet', () => ({ refundToWallet }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { decideReturnRequest } from './returns-admin'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: REFUND_ID,
    order_id: ORDER,
    state: 'requested',
    ground: 'distance_sale_14d',
    destination: 'original_method',
    requested_agorot: 10_000,
    granted_agorot: null,
    cancellation_fee_agorot: 0,
    requested_at: '2026-10-08T10:00:00.000Z',
    refund_due_by: '2026-10-22T10:00:00.000Z',
    reason_he: 'התחרטתי\nלא מתאים',
    reason_code: 'changed_mind',
    requested_by: 'user-1',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  updateChain.length = 0
  requireAdminSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  refundsRead.mockResolvedValue({ data: row(), error: null })
  refundsUpdate.mockResolvedValue({ data: [{ id: REFUND_ID }], error: null })
  auditInsert.mockResolvedValue({ error: null })
  profileRead.mockResolvedValue({
    data: { email: 'dana@example.com', full_name: 'דנה' },
    error: null,
  })
  sendEmail.mockResolvedValue({ ok: true, id: 'm1' })
  refundOrder.mockResolvedValue({
    ok: true,
    replay: false,
    orderId: ORDER,
    refundedIls: 95,
    feeIls: 5,
    cancelOnly: false,
  })
  refundToWallet.mockResolvedValue({
    ok: true,
    replay: false,
    orderId: ORDER,
    creditedAgorot: 10_000,
    goodwill: false,
  })
})

describe('decideReturnRequest: refusals', () => {
  it('refuses without an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('redirect'))
    expect(await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('reports a missing row', async () => {
    refundsRead.mockResolvedValue({ data: null, error: null })
    expect(await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })

  it('refuses a row that is no longer decidable', async () => {
    refundsRead.mockResolvedValue({ data: row({ state: 'completed' }), error: null })
    expect(await decideReturnRequest({ refundId: REFUND_ID, decision: 'reject' })).toMatchObject({
      ok: false,
      code: 'STATE_INVALID',
    })
    expect(refundOrder).not.toHaveBeenCalled()
    expect(refundsUpdate).not.toHaveBeenCalled()
  })
})

describe('decideReturnRequest: reject', () => {
  it('closes the row by CAS with the note, audits, mails the customer', async () => {
    const out = await decideReturnRequest({
      refundId: REFUND_ID,
      decision: 'reject',
      note: 'מעבר ל-14 יום',
    })
    expect(out).toEqual({
      ok: true,
      decision: 'rejected',
      rma: 'RMA-261008-8F3C2A1B',
      creditedAgorot: null,
    })
    expect(updateChain[0]).toEqual([
      'update',
      expect.objectContaining({
        state: 'rejected',
        decided_by: 'admin-1',
        internal_note: 'מעבר ל-14 יום',
      }),
    ])
    expect(updateChain).toContainEqual(['eq', 'id', REFUND_ID])
    expect(updateChain).toContainEqual(['in', 'state', ['requested', 'approved']])
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dana@example.com',
        idempotencyKey: 'return-rejected:RMA-261008-8F3C2A1B',
      }),
    )
    expect(sendEmail.mock.calls[0]?.[0].text).toContain('מעבר ל-14 יום')
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ entity_id: REFUND_ID }))
    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders/returns')
    expect(refundOrder).not.toHaveBeenCalled()
    expect(refundToWallet).not.toHaveBeenCalled()
  })

  it('reports a lost CAS as already handled', async () => {
    refundsUpdate.mockResolvedValue({ data: [], error: null })
    const out = await decideReturnRequest({ refundId: REFUND_ID, decision: 'reject', note: 'x' })
    expect(out).toMatchObject({ ok: false, code: 'STATE_INVALID' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('decideReturnRequest: approve', () => {
  it('sends a card request to refundOrder with the fee on a change of mind', async () => {
    const out = await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })
    expect(out).toEqual({
      ok: true,
      decision: 'approved',
      rma: 'RMA-261008-8F3C2A1B',
      creditedAgorot: 9_500,
    })
    expect(refundOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER, isDefectClaim: false }),
    )
    expect(refundOrder.mock.calls[0]?.[0].reason).toContain('RMA-261008-8F3C2A1B')
    expect(refundToWallet).not.toHaveBeenCalled()
  })

  it('zeroes the fee when the customer’s reason is the trader’s fault', async () => {
    refundsRead.mockResolvedValue({
      data: row({ ground: 'defect', reason_code: 'defective', reason_he: 'המוצר פגום' }),
      error: null,
    })
    await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })
    expect(refundOrder).toHaveBeenCalledWith(expect.objectContaining({ isDefectClaim: true }))
  })

  it('zeroes the fee when the admin waives it', async () => {
    await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve', waiveFee: true })
    expect(refundOrder).toHaveBeenCalledWith(expect.objectContaining({ isDefectClaim: true }))
  })

  it('sends a wallet request to refundToWallet and reports the credit', async () => {
    refundsRead.mockResolvedValue({ data: row({ destination: 'wallet' }), error: null })
    const out = await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })
    expect(out).toMatchObject({ ok: true, decision: 'approved', creditedAgorot: 10_000 })
    expect(refundToWallet).toHaveBeenCalledWith(expect.objectContaining({ orderId: ORDER }))
    expect(refundOrder).not.toHaveBeenCalled()
  })

  it('passes the money path’s refusal through unchanged', async () => {
    refundOrder.mockResolvedValue({ ok: false, error: 'נדחה', code: 'PROVIDER_ERROR' })
    const out = await decideReturnRequest({ refundId: REFUND_ID, decision: 'approve' })
    expect(out).toEqual({ ok: false, code: 'PROVIDER_ERROR', error: 'נדחה' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
