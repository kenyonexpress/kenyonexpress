import { beforeEach, describe, expect, it, vi } from 'vitest'

const logWarn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn() },
}))

import {
  deliveredDedupeKey,
  deliveredWhatsAppDedupeKey,
  enqueueDeliveredNotification,
  orderIsDelivered,
} from './delivered-notification'

const ORDER = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'
const USER = '22222222-2222-4222-8222-222222222222'
const ADDRESS = '33333333-3333-4333-8333-333333333333'

const rpc = vi.fn()
const profileRow = vi.fn()
const addressRow = vi.fn()

const admin = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: table === 'profiles' ? profileRow : addressRow }),
    }),
  }),
  rpc: (fn: string, args: unknown) => rpc(fn, args),
} as never

function rpcArgs(fn: string): Record<string, unknown> | undefined {
  return rpc.mock.calls.find((c) => c[0] === fn)?.[1] as Record<string, unknown> | undefined
}

beforeEach(() => {
  rpc.mockReset()
  profileRow.mockReset()
  addressRow.mockReset()
  logWarn.mockReset()
  profileRow.mockResolvedValue({
    data: { email: 'dana@example.com', full_name: 'דנה', phone: '050-123-4567' },
  })
  addressRow.mockResolvedValue({ data: null })
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
  it('enqueues the order_delivered mail through the RPC with the user id and the order dedupe key', async () => {
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      itemCount: 2,
    })
    expect(outcome.email).toBe('queued')
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

  it('enqueues the WhatsApp delivery confirmation as order_fulfilled under the 173 trigger key', async () => {
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      itemCount: 2,
    })
    expect(outcome.whatsapp).toBe('queued')
    expect(rpcArgs('fn_enqueue_whatsapp')).toEqual({
      p_kind: 'order_fulfilled',
      p_phone: '050-123-4567',
      p_dedupe: deliveredWhatsAppDedupeKey(ORDER),
      p_payload: expect.objectContaining({
        order_id: ORDER,
        order_ref: '3B6E6F1E',
        customer_name: 'דנה',
        status: 'delivered',
      }),
    })
    expect(deliveredWhatsAppDedupeKey(ORDER)).toBe(`wa:order_fulfilled:${ORDER}`)
  })

  it('falls back to the shipping address phone and name when the profile has none', async () => {
    profileRow.mockResolvedValue({
      data: { email: 'dana@example.com', full_name: null, phone: null },
    })
    addressRow.mockResolvedValue({ data: { phone: '0529876543', full_name: 'דנה מהכתובת' } })
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      addressId: ADDRESS,
      itemCount: 1,
    })
    expect(outcome.whatsapp).toBe('queued')
    expect(rpcArgs('fn_enqueue_whatsapp')).toMatchObject({
      p_phone: '0529876543',
      p_payload: expect.objectContaining({ customer_name: 'דנה מהכתובת' }),
    })
  })

  it('carries no amount on either leg: a delivery notice is not a money event', async () => {
    await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 })
    for (const call of rpc.mock.calls) {
      const payload = (call[1] as { p_payload: Record<string, unknown> }).p_payload
      for (const key of Object.keys(payload)) expect(key).not.toMatch(/agorot|ils|amount/)
    }
  })

  it('does nothing for a guest order, and skips each leg the profile cannot serve', async () => {
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: null, itemCount: 1 }),
    ).toEqual({ email: 'no_email', whatsapp: 'no_phone' })
    expect(rpc).not.toHaveBeenCalled()

    profileRow.mockResolvedValue({ data: { email: null, full_name: null, phone: null } })
    expect(
      await enqueueDeliveredNotification(admin, { orderId: ORDER, userId: USER, itemCount: 1 }),
    ).toEqual({ email: 'no_email', whatsapp: 'no_phone' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports the unapplied 253 constraint as not_accepted, with the hint, and does not throw', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'fn_enqueue_notification'
        ? { error: { code: '23514', message: 'violates check constraint' } }
        : { error: null },
    )
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      itemCount: 1,
    })
    expect(outcome).toEqual({ email: 'not_accepted', whatsapp: 'queued' })
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.delivered_kind_not_accepted',
      expect.objectContaining({ hint: expect.stringContaining('253') }),
    )
  })

  it('a WhatsApp enqueue failure is logged and does not touch the mail outcome', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'fn_enqueue_whatsapp'
        ? { error: { code: 'XX000', message: 'boom' } }
        : { error: null },
    )
    const outcome = await enqueueDeliveredNotification(admin, {
      orderId: ORDER,
      userId: USER,
      itemCount: 1,
    })
    expect(outcome).toEqual({ email: 'queued', whatsapp: 'failed' })
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.delivered_whatsapp_enqueue_failed',
      expect.objectContaining({ reason: 'boom' }),
    )
  })
})
