import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The customer's cancellation notice. The rules are proven in
 * lib/returns/policy.test.ts; what can only fail here is the plumbing: the
 * order is read on the customer's own scope, the row is written in
 * `requested` with the mapped ground and the paid total, the RMA comes back,
 * the two mails go out keyed on it, a second request loses to the lock, and
 * a database without 259 still takes the row.
 */

const ORDER = '11111111-1111-4111-8111-111111111111'
const REFUND_ID = '8f3c2a1b-7d6e-4f50-9a1b-2c3d4e5f6a7b'
const USER = { id: 'user-1', email: 'dana@example.com', user_metadata: { full_name: 'דנה' } }

const getUser = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const sendEmail = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
const getOrderDetail = vi.hoisted(() => vi.fn())
const getOpenReturnForOrder = vi.hoisted(() => vi.fn())
const refundsInsert = vi.hoisted(() => vi.fn())
const auditInsert = vi.hoisted(() => vi.fn())
const paymentsResult = vi.hoisted(() => ({ data: { id: 'pay-1' } as { id: string } | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'payments') {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
        q.maybeSingle = () => Promise.resolve({ data: paymentsResult.data, error: null })
        return q
      }
      if (table === 'refunds') {
        return {
          insert: (payload: unknown) => ({
            select: () => ({ maybeSingle: () => refundsInsert(payload) }),
          }),
        }
      }
      if (table === 'audit_log') return { insert: (payload: unknown) => auditInsert(payload) }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/contact-address', () => ({ contactEmail: () => 'info@kenyonexpress.co.il' }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/server/queries/orders', () => ({ getOrderDetail }))
vi.mock('@/server/queries/returns', () => ({ getOpenReturnForOrder }))

import { submitReturnRequest } from './returns'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID = { orderId: ORDER, reasonCode: 'changed_mind', destination: 'original_method' }

function paidOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORDER,
    status: 'paid',
    paidAt: '2026-10-01T10:00:00.000Z',
    totalAgorot: 10_000,
    lines: [
      {
        productType: 'coupon',
        settlementStatus: 'paid',
        deliveredAt: null,
        vouchers: [{ status: 'issued' }],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: USER } })
  checkRateLimit.mockResolvedValue(true)
  sendEmail.mockResolvedValue({ ok: true, id: 'm1' })
  getOrderDetail.mockResolvedValue(paidOrder())
  getOpenReturnForOrder.mockResolvedValue(null)
  paymentsResult.data = { id: 'pay-1' }
  refundsInsert.mockResolvedValue({
    data: { id: REFUND_ID, requested_at: '2026-10-08T10:00:00.000Z' },
    error: null,
  })
  auditInsert.mockResolvedValue({ error: null })
  vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00.000Z'), toFake: ['Date'] })
})

describe('submitReturnRequest: refusals before any write', () => {
  it('refuses a malformed form in Hebrew', async () => {
    const out = await submitReturnRequest(form({ ...VALID, reasonCode: 'because' }))
    expect(out).toMatchObject({ ok: false, reason: 'invalid', error: 'בחרו סיבה להחזרה' })
    expect(refundsInsert).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'signed_out' })
    expect(getOrderDetail).not.toHaveBeenCalled()
  })

  it('rate limits per user', async () => {
    checkRateLimit.mockResolvedValue(false)
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'rate_limited' })
    expect(checkRateLimit).toHaveBeenCalledWith('return-request:user-1', 5, 3600)
  })

  it('reads the order on the customer’s scope and refuses a foreign one as not found', async () => {
    getOrderDetail.mockResolvedValue(null)
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'not_found' })
    expect(getOrderDetail).toHaveBeenCalledWith(ORDER)
  })

  it('refuses an order outside its 14-day window', async () => {
    getOrderDetail.mockResolvedValue(paidOrder({ paidAt: '2026-09-01T10:00:00.000Z' }))
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'not_eligible' })
    expect(out.ok === false && out.error).toContain('14')
  })

  it('refuses a second request while one is open', async () => {
    getOpenReturnForOrder.mockResolvedValue({ id: 'r0', state: 'requested' })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'already_open' })
    expect(refundsInsert).not.toHaveBeenCalled()
  })

  it('refuses the card for a redeemed coupon and points at the wallet', async () => {
    getOrderDetail.mockResolvedValue(
      paidOrder({
        lines: [
          {
            productType: 'coupon',
            settlementStatus: 'paid',
            deliveredAt: null,
            vouchers: [{ status: 'redeemed' }],
          },
        ],
      }),
    )
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'destination_not_allowed' })
    const wallet = await submitReturnRequest(form({ ...VALID, destination: 'wallet' }))
    expect(wallet).toMatchObject({ ok: true })
  })
})

describe('submitReturnRequest: the notice', () => {
  it('writes the row in requested with the mapped ground, the paid total and no fee', async () => {
    const out = await submitReturnRequest(
      form({ ...VALID, reasonCode: 'defective', note: ' נשבר ' }),
    )
    expect(out).toEqual({ ok: true, rma: 'RMA-261008-8F3C2A1B', refundId: REFUND_ID })
    expect(refundsInsert).toHaveBeenCalledTimes(1)
    expect(refundsInsert.mock.calls[0]?.[0]).toEqual({
      order_id: ORDER,
      payment_id: 'pay-1',
      state: 'requested',
      ground: 'defect',
      destination: 'original_method',
      requested_agorot: 10_000,
      cancellation_fee_agorot: 0,
      granted_agorot: null,
      cancel_only: false,
      reason_he: 'המוצר פגום\nנשבר',
      reason_code: 'defective',
      requested_by: 'user-1',
      requested_at: '2026-10-08T10:00:00.000Z',
    })
  })

  it('mails the customer and the shop, each keyed on the RMA, and revalidates', async () => {
    await submitReturnRequest(form(VALID))
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const keys = sendEmail.mock.calls.map((c) => c[0].idempotencyKey).sort()
    expect(keys).toEqual([
      'return-received-owner:RMA-261008-8F3C2A1B',
      'return-received:RMA-261008-8F3C2A1B',
    ])
    const toCustomer = sendEmail.mock.calls.find((c) => c[0].to === 'dana@example.com')?.[0]
    expect(toCustomer.text).toContain('RMA-261008-8F3C2A1B')
    expect(toCustomer.text).toContain('דמי ביטול')
    const toShop = sendEmail.mock.calls.find((c) => c[0].to === 'info@kenyonexpress.co.il')?.[0]
    expect(toShop.replyTo).toBe('dana@example.com')
    expect(revalidatePath).toHaveBeenCalledWith('/account/return')
    expect(revalidatePath).toHaveBeenCalledWith(`/account/orders/${ORDER}`)
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: 'user-1', entity_type: 'refund', entity_id: REFUND_ID }),
    )
  })

  it('does not fail the request when a mail fails', async () => {
    sendEmail.mockResolvedValue({ ok: false, reason: 'resend down' })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: true })
  })

  it('retries without reason_code when 259 is not applied, keeping the code in reason_he', async () => {
    refundsInsert
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST204', message: "Could not find the 'reason_code' column" },
      })
      .mockResolvedValueOnce({
        data: { id: REFUND_ID, requested_at: '2026-10-08T10:00:00.000Z' },
        error: null,
      })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: true, rma: 'RMA-261008-8F3C2A1B' })
    expect(refundsInsert).toHaveBeenCalledTimes(2)
    const second = refundsInsert.mock.calls[1]?.[0] as Record<string, unknown>
    expect('reason_code' in second).toBe(false)
    expect(second.reason_he).toBe('התחרטתי')
  })

  it('reads a lost race on the open-row index as already_open', async () => {
    refundsInsert.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'already_open' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reports any other write failure without mailing', async () => {
    refundsInsert.mockResolvedValue({ data: null, error: { code: '23514', message: 'check' } })
    const out = await submitReturnRequest(form(VALID))
    expect(out).toMatchObject({ ok: false, reason: 'error' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('writes a null payment id for an order with no card charge', async () => {
    paymentsResult.data = null
    await submitReturnRequest(form({ ...VALID, destination: 'wallet' }))
    expect(refundsInsert.mock.calls[0]?.[0]).toMatchObject({
      payment_id: null,
      destination: 'wallet',
    })
  })
})
