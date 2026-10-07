import { MockCarrierProvider, mockTrackingNumber } from '@/lib/shipping/providers/mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const enqueueDeliveredNotification = vi.fn(async (..._args: unknown[]) => ({
  email: 'queued',
  whatsapp: 'no_phone',
}))
vi.mock('@/server/orders/delivered-notification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/orders/delivered-notification')>()
  return {
    ...actual,
    enqueueDeliveredNotification: (...a: unknown[]) => enqueueDeliveredNotification(...a),
  }
})
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { pollActiveShipments, refreshShipmentRow } from './tracking-poll'

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const T0 = Date.UTC(2026, 9, 8, 10, 0, 0)
const HOUR = 3_600_000

function fakeAdmin(opts: {
  rows?: unknown[] | null
  rowsError?: { code: string; message: string } | null
  orderStatus?: string
  linesAfter?: {
    product_type: string
    item_status: string
    tracking_number: string | null
    carrier: string | null
  }[]
}) {
  const writes: { table: string; v: Record<string, unknown> }[] = []
  let pendingLineMove = false
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        in: self,
        not: self,
        order: self,
        limit: self,
        update: (v: Record<string, unknown>) => {
          writes.push({ table, v })
          if (table === 'order_items') pendingLineMove = true
          return chain
        },
        maybeSingle: async () => {
          if (table === 'orders')
            return {
              data: {
                id: ORDER_ID,
                status: opts.orderStatus ?? 'paid',
                user_id: 'u1',
                address_id: null,
              },
              error: null,
            }
          return { data: null, error: null }
        },
        // biome-ignore lint/suspicious/noThenProperty: the fake must be awaitable like a PostgREST builder
        then: (resolve: (v: unknown) => void) => {
          if (table === 'shipments') {
            if (writes.at(-1)?.table === 'shipments') return resolve({ data: null, error: null })
            return resolve({ data: opts.rows ?? [], error: opts.rowsError ?? null })
          }
          if (table === 'order_items') {
            // The first await after an update is the UPDATE itself (moved rows);
            // the next is the re-read of the order's lines for the fold.
            if (pendingLineMove) {
              pendingLineMove = false
              return resolve({ data: [{ id: 'l1' }], error: null })
            }
            return resolve({ data: opts.linesAfter ?? [], error: null })
          }
          return resolve({ data: [], error: null })
        },
      })
      return chain
    },
  }
  return { admin: admin as never, writes }
}

function row(carrier: 'chita', status = 'label_created', birth = T0) {
  return {
    id: 's1',
    order_id: ORDER_ID,
    carrier_id: carrier,
    tracking_number: mockTrackingNumber(carrier, ORDER_ID, birth),
    status,
    order_item_ids: ['l1'],
    events: [
      {
        at: new Date(birth).toISOString(),
        status: 'label_created',
        description: 'תווית נוצרה',
        location: null,
      },
    ],
  }
}

describe('refreshShipmentRow', () => {
  beforeEach(() => enqueueDeliveredNotification.mockClear())

  it('writes the carrier answer, merging events without duplicates', async () => {
    const { admin, writes } = fakeAdmin({})
    const outcome = await refreshShipmentRow(admin, row('chita') as never, {
      providerFor: () => new MockCarrierProvider('chita', () => T0 + 3 * HOUR),
      now: () => new Date(T0 + 3 * HOUR),
    })
    expect(outcome).toMatchObject({
      ok: true,
      status: 'in_transit',
      changed: true,
      deliveredLines: 0,
    })
    const write = writes.find((w) => w.table === 'shipments')!
    expect(write.v.status).toBe('in_transit')
    expect((write.v.events as unknown[]).length).toBe(2)
    expect(write.v.last_polled_at).toBe(new Date(T0 + 3 * HOUR).toISOString())
    expect(writes.some((w) => w.table === 'order_items')).toBe(false)
  })

  it('delivers the covered lines once and lets the order fold send the mail', async () => {
    const { admin, writes } = fakeAdmin({
      linesAfter: [
        {
          product_type: 'physical',
          item_status: 'delivered',
          tracking_number: 'x',
          carrier: "צ'יטה",
        },
        { product_type: 'coupon', item_status: 'issued', tracking_number: null, carrier: null },
      ],
    })
    const outcome = await refreshShipmentRow(admin, row('chita', 'out_for_delivery') as never, {
      providerFor: () => new MockCarrierProvider('chita', () => T0 + 40 * HOUR),
      now: () => new Date(T0 + 40 * HOUR),
    })
    expect(outcome).toMatchObject({ ok: true, status: 'delivered', deliveredLines: 1 })
    const lineWrite = writes.find((w) => w.table === 'order_items')!
    expect(lineWrite.v).toMatchObject({ item_status: 'delivered' })
    expect(enqueueDeliveredNotification).toHaveBeenCalledTimes(1)
    const shipWrite = writes.find((w) => w.table === 'shipments')!
    expect(shipWrite.v.delivered_at).toBeDefined()
  })

  it('does not deliver lines of an order the machine refuses', async () => {
    const { admin, writes } = fakeAdmin({ orderStatus: 'refunded' })
    const outcome = await refreshShipmentRow(admin, row('chita') as never, {
      providerFor: () => new MockCarrierProvider('chita', () => T0 + 40 * HOUR),
      now: () => new Date(T0 + 40 * HOUR),
    })
    expect(outcome.deliveredLines).toBe(0)
    expect(writes.some((w) => w.table === 'order_items')).toBe(false)
    expect(enqueueDeliveredNotification).not.toHaveBeenCalled()
  })

  it('marks a row polled when the carrier fails, so one dead courier does not pin the queue', async () => {
    const { admin, writes } = fakeAdmin({})
    const broken = new MockCarrierProvider('chita', () => T0)
    vi.spyOn(broken, 'track').mockRejectedValue(new Error('timeout'))
    const outcome = await refreshShipmentRow(admin, row('chita') as never, {
      providerFor: () => broken,
      now: () => new Date(T0 + HOUR),
    })
    expect(outcome.ok).toBe(false)
    expect(writes).toEqual([
      { table: 'shipments', v: { last_polled_at: new Date(T0 + HOUR).toISOString() } },
    ])
  })
})

describe('pollActiveShipments', () => {
  it('reports a missing table as skipped with nothing polled', async () => {
    const { admin } = fakeAdmin({ rows: null, rowsError: { code: 'PGRST205', message: 'missing' } })
    expect(await pollActiveShipments(admin, {})).toEqual({
      polled: 0,
      updated: 0,
      delivered: 0,
      failed: 0,
      skipped: 'table_missing',
    })
  })

  it('counts polled, updated and failed rows', async () => {
    const good = row('chita')
    const bad = { ...row('chita'), id: 's2', tracking_number: 'RR1' }
    const { admin } = fakeAdmin({ rows: [good, bad] })
    const provider = new MockCarrierProvider('chita', () => T0 + 3 * HOUR)
    const original = provider.track.bind(provider)
    vi.spyOn(provider, 'track').mockImplementation(async (n) => {
      if (n === 'RR1') throw new Error('nope')
      return original(n)
    })
    const summary = await pollActiveShipments(admin, {
      providerFor: () => provider,
      now: () => new Date(T0 + 3 * HOUR),
    })
    expect(summary).toEqual({ polled: 2, updated: 1, delivered: 0, failed: 1, skipped: null })
  })
})
