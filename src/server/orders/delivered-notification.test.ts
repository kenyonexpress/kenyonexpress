import { beforeEach, describe, expect, it, vi } from 'vitest'

const logWarn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn() },
}))

import {
  deliveredDedupeKey,
  enqueueDeliveredNotification,
  orderIsDelivered,
} from './delivered-notification'

const ORDER = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'
const USER = '22222222-2222-4222-8222-222222222222'

const rpc = vi.fn()
const maybeSingle = vi.fn()

const admin = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  rpc: (fn: string, args: unknown) => rpc(fn, args),
} as never

beforeEach(() => {
  rpc.mockReset()
  maybeSingle.mockReset()
  logWarn.mockReset()
  maybeSingle.mockResolvedValue({ data: { email: 'dana@example.com', full_name: 'דנה' } })
  rpc.mockResolvedValue({ error: null })
})

describe('orderIsDelivered', () => {
  const line = (itemStatus: string, productType: 'physical' | 'coupon' = 'physical') => ({
    productType,
    itemStatus,
    trackingNumber: null,
    carrier: null,
  })

  it('is true only when every live physical line is delivered', () => {
    expect(orderIsDelivered([line('delivered'), line('delivered')])).toBe(true)
    expect(orderIsDelivered([line('delivered'), line('shipped')])).toBe(false)
    expect(orderIsDelivered([line('delivered'), line('pending')])).toBe(false)
  })

  it('ignores coupons and closed lines, the same fold the account page uses', () => {
    expect(orderIsDelivered([line('delivered'), line('cancelled'), line('issued', 'coupon')])).toBe(
      true,
    )
    // Nothing physical and live: not delivered, there was nothing to deliver.
    expect(orderIsDelivered([line('issued', 'coupon')])).toBe(false)
    expect(orderIsDelivered([])).toBe(false)
  })
})

describe('enqueueDeliveredNotification', () => {
  it('enqueues order_delivered through the RPC with the user id and the order dedupe key', async () => {
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      itemCount: 2,
    })
    expect(outcome).toBe('queued')
    expect(rpc).toHaveBeenCalledWith(
      'fn_enqueue_notification',
      expect.objectContaining({
        p_kind: 'order_delivered',
        p_email: 'dana@example.com',
        p_dedupe: deliveredDedupeKey(ORDER),
        p_user_id: USER,
        p_payload: expect.objectContaining({
          order_id: ORDER,
          order_ref: '3B6E6F1E',
          customer_name: 'דנה',
          item_count: 2,
          delivered_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      }),
    )
  })

  it('carries no amount: a delivery notice is not a money event', async () => {
    await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 })
    const payload = (rpc.mock.calls[0]?.[1] as { p_payload: Record<string, unknown> }).p_payload
    for (const key of Object.keys(payload)) expect(key).not.toMatch(/agorot|ils|amount/)
  })

  it('does nothing for a guest order or a profile with no address', async () => {
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: null, itemCount: 1 }),
    ).toBe('no_email')
    maybeSingle.mockResolvedValue({ data: { email: null, full_name: null } })
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 }),
    ).toBe('no_email')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports the unapplied 253 constraint as not_accepted, with the hint, and does not throw', async () => {
    rpc.mockResolvedValue({ error: { code: '23514', message: 'violates check constraint' } })
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 }),
    ).toBe('not_accepted')
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.delivered_kind_not_accepted',
      expect.objectContaining({ hint: expect.stringContaining('253') }),
    )
  })

  it('logs any other failure and reports it, never throwing at the caller', async () => {
    rpc.mockResolvedValue({ error: { code: 'XX000', message: 'boom' } })
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 }),
    ).toBe('failed')
    expect(logWarn).toHaveBeenCalledWith('fulfillment.delivered_email_enqueue_failed', {
      orderId: ORDER,
      reason: 'boom',
    })
  })
})
