import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { shipmentFromRow, shipmentsFromLines } from './shipments'

const ORDER_ID = '33333333-3333-4333-8333-333333333333'

describe('shipmentsFromLines (fallback before 258)', () => {
  it('builds one entry per tracked physical line with a two-step history', () => {
    const out = shipmentsFromLines(ORDER_ID, [
      {
        id: 'l1',
        productType: 'physical',
        itemStatus: 'shipped',
        carrier: 'דואר ישראל',
        trackingNumber: 'RR1IL',
        shippedAt: '2026-10-08T10:00:00Z',
        deliveredAt: null,
      },
      {
        id: 'l2',
        productType: 'physical',
        itemStatus: 'shipped',
        carrier: 'דואר ישראל',
        trackingNumber: 'RR1IL',
        shippedAt: '2026-10-08T10:00:00Z',
        deliveredAt: null,
      },
      {
        id: 'l3',
        productType: 'physical',
        itemStatus: 'pending',
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
      },
      {
        id: 'l4',
        productType: 'coupon',
        itemStatus: 'issued',
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
      },
      {
        id: 'l5',
        productType: 'physical',
        itemStatus: 'delivered',
        carrier: 'שליח של הספק',
        trackingNumber: null,
        shippedAt: '2026-10-01T10:00:00Z',
        deliveredAt: '2026-10-03T10:00:00Z',
      },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      orderId: ORDER_ID,
      carrierId: 'israel_post',
      carrierLabel: 'דואר ישראל',
      trackingNumber: 'RR1IL',
      trackingUrl: 'https://israelpost.co.il/itemtrace/?itemcode=RR1IL',
      status: 'in_transit',
      statusLabel: 'בדרך אליך',
      step: 1,
      live: false,
    })
    expect(out[1]).toMatchObject({
      carrierId: null,
      carrierLabel: 'שליח של הספק',
      trackingUrl: null,
      status: 'delivered',
      step: 3,
      tone: 'ok',
    })
    expect(out[1]?.events.map((e) => e.status)).toEqual(['delivered', 'in_transit'])
  })

  it('maps a shipments row onto the same shape, marked live', () => {
    const view = shipmentFromRow({
      id: 's1',
      order_id: ORDER_ID,
      carrier_id: 'chita',
      service_code: 'express',
      status: 'out_for_delivery',
      tracking_number: 'KEMOCK-CH-1-2',
      events: [
        {
          at: '2026-10-09T07:00:00Z',
          status: 'out_for_delivery',
          description: 'יצא לחלוקה',
          location: null,
        },
      ],
      estimated_delivery: '2026-10-09',
    })
    expect(view).toMatchObject({
      carrierId: 'chita',
      carrierLabel: "צ'יטה שליחויות",
      serviceLabel: 'שליח מהיר, עד יום עסקים',
      trackingUrl: 'https://chita.co.il/tracking',
      statusLabel: 'יצא לחלוקה',
      step: 2,
      live: true,
      estimatedDelivery: '2026-10-09',
    })
    expect(
      shipmentFromRow({
        id: 's2',
        order_id: ORDER_ID,
        carrier_id: 'ups',
        service_code: 'x',
        status: 'weird',
        tracking_number: '1',
        events: null,
        estimated_delivery: null,
      }),
    ).toMatchObject({
      carrierId: null,
      carrierLabel: 'UPS',
      status: null,
      statusLabel: 'בטיפול',
      step: 1,
    })
  })
})
