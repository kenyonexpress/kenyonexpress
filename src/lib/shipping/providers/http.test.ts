import { agorot } from '@/lib/money'
import { describe, expect, it, vi } from 'vitest'
import { type FetchLike, HttpCarrierProvider } from './http'
import { CarrierError } from './types'

const credentials = { baseUrl: 'https://api.carrier.test', apiKey: 'secret-key', accountId: '77' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('HttpCarrierProvider', () => {
  it('sends the bearer key and account header, and converts shekels to agorot', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        quotes: [
          { service_code: 'standard', price_ils: '29.90', min_days: 2, max_days: 4 },
          { service_code: 'unknown', price_ils: 1 },
        ],
      }),
    )
    const provider = new HttpCarrierProvider('chita', credentials, 5000, fetchImpl)
    const quotes = await provider.quote({
      carrierId: 'chita',
      destination: { city: 'חיפה', zip: '3100000' },
      parcel: { weightGrams: 800, declaredValueAgorot: agorot(12_050), pieces: 1 },
    })
    expect(quotes).toEqual([
      {
        carrierId: 'chita',
        serviceCode: 'standard',
        carrierCostAgorot: 2990,
        minDays: 2,
        maxDays: 4,
        quoteRef: null,
      },
    ])
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.carrier.test/v1/quotes')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-key')
    expect(headers['X-Account-Id']).toBe('77')
    expect(JSON.parse(init.body as string).parcel.declared_value_ils).toBe(120.5)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('decodes a label PDF and keeps the key out of raw', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake').toString('base64')
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        tracking_number: 'CH123',
        shipment_id: 9001,
        label_pdf_base64: pdf,
        price_ils: 31,
      }),
    )
    const provider = new HttpCarrierProvider('chita', credentials, 5000, fetchImpl)
    const created = await provider.createLabel({
      carrierId: 'chita',
      serviceCode: 'standard',
      orderId: 'o1',
      orderRef: 'O1',
      destination: {
        fullName: 'x',
        phone: null,
        city: 'c',
        street: 's',
        streetNumber: null,
        apartment: null,
        floor: null,
        entrance: null,
        zip: null,
        notes: null,
      },
      parcel: { weightGrams: 500, declaredValueAgorot: agorot(100), pieces: 1 },
      quoteRef: 'q',
    })
    expect(created.trackingNumber).toBe('CH123')
    expect(created.providerShipmentId).toBe('9001')
    expect(created.carrierCostAgorot).toBe(3100)
    expect(Buffer.from(created.labelPdf!).toString()).toBe('%PDF-1.4 fake')
    expect(JSON.stringify(created.raw)).not.toContain(pdf)
    expect(JSON.stringify(created.raw)).not.toContain('secret-key')
  })

  it('normalises tracking events and orders them newest first', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        status: 'Out for delivery',
        estimated_delivery: '2026-10-10',
        events: [
          { at: '2026-10-08T08:00:00Z', status: 'Label created' },
          { at: '2026-10-09T07:00:00Z', description: 'יצא לחלוקה', location: 'חיפה' },
        ],
      }),
    )
    const provider = new HttpCarrierProvider('israel_post', credentials, 5000, fetchImpl)
    const result = await provider.track('RR1')
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.carrier.test/v1/shipments/RR1/tracking')
    expect(result.status).toBe('out_for_delivery')
    expect(result.events.map((e) => e.status)).toEqual(['out_for_delivery', 'label_created'])
    expect(result.events[0]?.location).toBe('חיפה')
    expect(result.estimatedDelivery).toBe('2026-10-10')
  })

  it('types every failure so the caller can degrade', async () => {
    const make = (impl: FetchLike) => new HttpCarrierProvider('yamit', credentials, 5000, impl)
    await expect(make(async () => jsonResponse({}, 401)).track('x')).rejects.toMatchObject({
      name: 'CarrierError',
      kind: 'auth',
    })
    await expect(make(async () => jsonResponse({}, 500)).track('x')).rejects.toMatchObject({
      kind: 'rejected',
    })
    await expect(
      make(async () => new Response('<html>', { status: 200 })).track('x'),
    ).rejects.toMatchObject({ kind: 'malformed' })
    await expect(
      make(async () => jsonResponse({ quotes: 'nope' })).quote({
        carrierId: 'yamit',
        destination: { city: 'c', zip: null },
        parcel: { weightGrams: 1, declaredValueAgorot: agorot(1), pieces: 1 },
      }),
    ).rejects.toMatchObject({ kind: 'malformed' })
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    await expect(
      make(async () => {
        throw timeout
      }).track('x'),
    ).rejects.toMatchObject({ kind: 'timeout' })
    await expect(
      make(async () => {
        throw new Error('ECONNRESET')
      }).track('x'),
    ).rejects.toBeInstanceOf(CarrierError)
  })
})
