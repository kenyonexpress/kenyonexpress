import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { MockCarrierProvider, mockStatusAt, mockTrackingBirthMs, mockTrackingNumber } from './mock'
import type { CreateLabelRequest } from './types'

const T0 = Date.UTC(2026, 9, 8, 10, 0, 0)
const HOUR = 3_600_000

const label: CreateLabelRequest = {
  carrierId: 'chita',
  serviceCode: 'express',
  orderId: '11111111-1111-4111-8111-111111111111',
  orderRef: '11111111',
  destination: {
    fullName: 'דנה כהן',
    phone: '0501234567',
    city: 'תל אביב',
    street: 'דיזנגוף',
    streetNumber: '100',
    apartment: null,
    floor: null,
    entrance: null,
    zip: '6433222',
    notes: null,
  },
  parcel: { weightGrams: 1500, declaredValueAgorot: agorot(19_900), pieces: 1 },
  quoteRef: null,
}

describe('MockCarrierProvider', () => {
  it('quotes every service, priced per started kilogram in integer agorot', async () => {
    const provider = new MockCarrierProvider('chita', () => T0)
    const quotes = await provider.quote({
      carrierId: 'chita',
      destination: { city: 'תל אביב', zip: null },
      parcel: { weightGrams: 1500, declaredValueAgorot: agorot(1), pieces: 1 },
    })
    expect(quotes.map((q) => q.serviceCode)).toEqual(['standard', 'express'])
    // 2 kg * 2990 = 5980; express is 1.6x.
    expect(quotes[0]?.carrierCostAgorot).toBe(5980)
    expect(quotes[1]?.carrierCostAgorot).toBe(9568)
    for (const q of quotes) expect(Number.isInteger(q.carrierCostAgorot)).toBe(true)
  })

  it('refuses a parcel over the carrier ceiling', async () => {
    const provider = new MockCarrierProvider('israel_post', () => T0)
    const quotes = await provider.quote({
      carrierId: 'israel_post',
      destination: { city: 'x', zip: null },
      parcel: { weightGrams: 25_000, declaredValueAgorot: agorot(1), pieces: 1 },
    })
    expect(quotes).toEqual([])
  })

  it('creates a label whose number encodes its birth, with no PDF of its own', async () => {
    const provider = new MockCarrierProvider('chita', () => T0)
    const created = await provider.createLabel(label)
    expect(created.trackingNumber).toMatch(/^KEMOCK-CH-[0-9A-Z]+-[0-9A-Z]{1,6}$/)
    expect(created.labelPdf).toBeNull()
    expect(created.carrierCostAgorot).toBe(9568)
    expect(mockTrackingBirthMs(created.trackingNumber)).toBe(Math.floor(T0 / 60_000) * 60_000)
    expect(mockTrackingNumber('chita', label.orderId, T0)).toBe(created.trackingNumber)
  })

  it('advances tracking with the clock and is readable from a fresh instance', async () => {
    const number = mockTrackingNumber('yamit', label.orderId, T0)
    const at = (ms: number) => new MockCarrierProvider('yamit', () => T0 + ms).track(number)
    expect((await at(0)).status).toBe('label_created')
    expect((await at(3 * HOUR)).status).toBe('in_transit')
    expect((await at(31 * HOUR)).status).toBe('out_for_delivery')
    const done = await at(40 * HOUR)
    expect(done.status).toBe('delivered')
    expect(done.events[0]?.status).toBe('delivered')
    expect(done.events).toHaveLength(4)
    expect(done.estimatedDelivery).toBeNull()
    expect((await at(3 * HOUR)).estimatedDelivery).toBe('2026-10-09')
  })

  it('answers in_transit with no events for a number it did not issue', async () => {
    const result = await new MockCarrierProvider('chita', () => T0).track('RR123456789IL')
    expect(result.status).toBe('in_transit')
    expect(result.events).toEqual([])
    expect(mockTrackingBirthMs('RR123456789IL')).toBeNull()
  })

  it('pins the journey timings', () => {
    expect(mockStatusAt(0)).toBe('label_created')
    expect(mockStatusAt(2 * HOUR)).toBe('in_transit')
    expect(mockStatusAt(30 * HOUR)).toBe('out_for_delivery')
    expect(mockStatusAt(36 * HOUR)).toBe('delivered')
  })
})
