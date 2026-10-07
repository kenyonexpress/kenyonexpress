import { MockCarrierProvider } from '@/lib/shipping/providers/mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeAuditLog = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (...a: unknown[]) => writeAuditLog(...a) }))
const enqueueShippedNotifications = vi.fn(async (..._args: unknown[]) => ({
  email: 'queued',
  whatsapp: 'no_phone',
}))
vi.mock('@/server/orders/shipped-notification', () => ({
  enqueueShippedNotifications: (...a: unknown[]) => enqueueShippedNotifications(...a),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createShipmentForOrder, labelSender, shipmentStorageKey } from './shipments'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const T0 = new Date('2026-10-08T10:00:00.000Z')

type Calls = { updates: unknown[]; inserts: unknown[] }

function fakeAdmin(opts: {
  order?: Record<string, unknown> | null
  address?: Record<string, unknown> | null
  insertError?: { code: string; message: string } | null
  moveRows?: { id: string }[]
}) {
  const calls: Calls = { updates: [], inserts: [] }
  const order =
    opts.order === undefined
      ? {
          id: ORDER_ID,
          status: 'paid',
          user_id: 'u1',
          address_id: 'a1',
          order_items: [
            {
              id: 'l1',
              product_type: 'physical',
              item_status: 'pending',
              quantity: 2,
              product_id: 'p1',
              total_price_ils: '199.90',
            },
            {
              id: 'l2',
              product_type: 'coupon',
              item_status: 'pending',
              quantity: 1,
              product_id: 'p2',
              total_price_ils: 40,
            },
          ],
        }
      : opts.order
  const address =
    opts.address === undefined
      ? {
          full_name: 'דנה כהן',
          phone: '0501234567',
          city: 'תל אביב',
          street: 'דיזנגוף',
          street_number: '100',
          apartment: null,
          floor: null,
          entrance: null,
          zip: null,
          notes_for_courier: null,
        }
      : opts.address
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        is: self,
        in: self,
        update: (v: unknown) => {
          calls.updates.push({ table, v })
          return chain
        },
        insert: (v: unknown) => {
          calls.inserts.push({ table, v })
          return chain
        },
        maybeSingle: async () => {
          if (table === 'orders') return { data: order, error: null }
          if (table === 'user_addresses') return { data: address, error: null }
          if (table === 'shipments') {
            if (opts.insertError) return { data: null, error: opts.insertError }
            return { data: { id: 's1' }, error: null }
          }
          return { data: null, error: null }
        },
        // biome-ignore lint/suspicious/noThenProperty: the fake must be awaitable like a PostgREST builder
        then: (resolve: (v: unknown) => void) => {
          // awaited chains without maybeSingle: products read, order_items update
          if (table === 'products')
            return resolve({ data: [{ id: 'p1', weight_grams: 250 }], error: null })
          if (table === 'order_items')
            return resolve({ data: opts.moveRows ?? [{ id: 'l1' }], error: null })
          return resolve({ data: [], error: null })
        },
      })
      return chain
    },
  }
  return { admin: admin as never, calls }
}

describe('createShipmentForOrder', () => {
  beforeEach(() => {
    writeAuditLog.mockClear()
    enqueueShippedNotifications.mockClear()
  })

  it('labels, ships the pending physical lines, stores the row, notifies and audits', async () => {
    const { admin, calls } = fakeAdmin({})
    const result = await createShipmentForOrder(
      admin,
      {
        orderId: ORDER_ID,
        carrierId: 'chita',
        serviceCode: 'express',
        actorId: 'admin1',
        actorRole: 'admin',
        now: T0,
      },
      { provider: new MockCarrierProvider('chita', () => T0.getTime()), archive: async () => null },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.trackingNumber).toMatch(/^KEMOCK-CH-/)
    expect(result.linesShipped).toBe(1)
    expect(result.stored).toBe(true)
    expect(result.shipmentId).toBe('s1')
    expect(result.notified).toBe(true)
    expect(Buffer.from(result.labelPdf.slice(0, 5)).toString()).toBe('%PDF-')

    const move = calls.updates.find((u) => (u as { table: string }).table === 'order_items') as {
      v: Record<string, unknown>
    }
    expect(move.v).toMatchObject({
      item_status: 'shipped',
      carrier: "צ'יטה",
      tracking_number: result.trackingNumber,
    })
    const insert = calls.inserts[0] as { v: Record<string, unknown> }
    expect(insert.v).toMatchObject({
      order_id: ORDER_ID,
      carrier_id: 'chita',
      service_code: 'express',
      provider_kind: 'mock',
      weight_grams: 500,
      pieces: 2,
      order_item_ids: ['l1'],
      shopper_agorot: 0,
    })
    expect(Number.isInteger(insert.v.carrier_cost_agorot)).toBe(true)
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    const notice = enqueueShippedNotifications.mock.calls[0]?.[1] as unknown as {
      shipments: unknown[]
    }
    expect(notice.shipments).toEqual([{ carrier: "צ'יטה", tracking_number: result.trackingNumber }])
  }, 20_000)

  it('still returns the label when the shipments table is missing (258 pending)', async () => {
    const { admin } = fakeAdmin({
      insertError: { code: '42P01', message: 'relation does not exist' },
    })
    const result = await createShipmentForOrder(
      admin,
      {
        orderId: ORDER_ID,
        carrierId: 'israel_post',
        serviceCode: null,
        actorId: null,
        actorRole: null,
        now: T0,
      },
      {
        provider: new MockCarrierProvider('israel_post', () => T0.getTime()),
        archive: async () => null,
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stored).toBe(false)
    expect(result.shipmentId).toBeNull()
    expect(result.serviceCode).toBe('registered')
  }, 20_000)

  it('refuses before calling the carrier when nothing is pending or the order is unpaid', async () => {
    const provider = new MockCarrierProvider('chita', () => T0.getTime())
    const spy = vi.spyOn(provider, 'createLabel')
    const shipped = fakeAdmin({
      order: {
        id: ORDER_ID,
        status: 'paid',
        user_id: 'u1',
        address_id: 'a1',
        order_items: [
          {
            id: 'l1',
            product_type: 'physical',
            item_status: 'shipped',
            quantity: 1,
            product_id: null,
            total_price_ils: 1,
          },
        ],
      },
    })
    expect(
      await createShipmentForOrder(
        shipped.admin,
        {
          orderId: ORDER_ID,
          carrierId: 'chita',
          serviceCode: null,
          actorId: null,
          actorRole: null,
        },
        { provider },
      ),
    ).toMatchObject({ ok: false, code: 'NO_LINES' })
    const unpaid = fakeAdmin({
      order: {
        id: ORDER_ID,
        status: 'pending',
        user_id: 'u1',
        address_id: 'a1',
        order_items: [
          {
            id: 'l1',
            product_type: 'physical',
            item_status: 'pending',
            quantity: 1,
            product_id: null,
            total_price_ils: 1,
          },
        ],
      },
    })
    expect(
      await createShipmentForOrder(
        unpaid.admin,
        {
          orderId: ORDER_ID,
          carrierId: 'chita',
          serviceCode: null,
          actorId: null,
          actorRole: null,
        },
        { provider },
      ),
    ).toMatchObject({ ok: false, code: 'NOT_ALLOWED' })
    const noAddress = fakeAdmin({
      order: {
        id: ORDER_ID,
        status: 'paid',
        user_id: 'u1',
        address_id: null,
        order_items: [
          {
            id: 'l1',
            product_type: 'physical',
            item_status: 'pending',
            quantity: 1,
            product_id: null,
            total_price_ils: 1,
          },
        ],
      },
    })
    expect(
      await createShipmentForOrder(
        noAddress.admin,
        {
          orderId: ORDER_ID,
          carrierId: 'chita',
          serviceCode: null,
          actorId: null,
          actorRole: null,
        },
        { provider },
      ),
    ).toMatchObject({ ok: false, code: 'NO_ADDRESS' })
    expect(fakeAdmin({ order: null }).admin).toBeDefined()
    expect(
      await createShipmentForOrder(
        fakeAdmin({ order: null }).admin,
        {
          orderId: ORDER_ID,
          carrierId: 'chita',
          serviceCode: null,
          actorId: null,
          actorRole: null,
        },
        { provider },
      ),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(spy).not.toHaveBeenCalled()
    expect(enqueueShippedNotifications).not.toHaveBeenCalled()
  })

  it('reports a carrier failure in Hebrew and writes nothing', async () => {
    const provider = new MockCarrierProvider('yamit', () => T0.getTime())
    vi.spyOn(provider, 'createLabel').mockRejectedValue(new Error('boom'))
    const { admin, calls } = fakeAdmin({})
    const result = await createShipmentForOrder(
      admin,
      { orderId: ORDER_ID, carrierId: 'yamit', serviceCode: null, actorId: null, actorRole: null },
      { provider },
    )
    expect(result).toMatchObject({ ok: false, code: 'CARRIER' })
    expect(calls.updates).toEqual([])
    expect(calls.inserts).toEqual([])
  })

  it('names the sender from the invoice issuer and keys the archive by order and number', () => {
    expect(
      labelSender({
        INVOICE_ISSUER_NAME: 'קניון אקספרס בע"מ',
        INVOICE_ISSUER_ADDRESS: 'הרצל 1',
        SHIPPING_SENDER_PHONE: ' 03-1 ',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ name: 'קניון אקספרס בע"מ', addressLine: 'הרצל 1', phone: '03-1' })
    expect(labelSender({} as unknown as NodeJS.ProcessEnv)).toEqual({
      name: 'KenyonExpress',
      addressLine: 'ישראל',
      phone: null,
    })
    expect(shipmentStorageKey(ORDER_ID, 'KEMOCK-CH-1-2')).toBe(
      `labels/${ORDER_ID}/label-KEMOCK-CH-1-2.pdf`,
    )
  })
})
