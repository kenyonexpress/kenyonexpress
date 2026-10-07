import { agorot } from '@/lib/money'
import { MockCarrierProvider } from '@/lib/shipping/providers/mock'
import type { CarrierProvider } from '@/lib/shipping/providers/types'
import { describe, expect, it, vi } from 'vitest'
import { quoteCheckoutOptions, readZonePolicies } from './quotes'

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function adminWithZones(
  rows: unknown[] | null,
  error: { code?: string; message: string } | null = null,
) {
  return {
    from: (table: string) => {
      if (table !== 'shipping_zones') throw new Error(`unexpected table ${table}`)
      return {
        select: async () => ({ data: rows, error }),
      }
    },
  } as never
}

const T0 = Date.UTC(2026, 9, 8)

describe('readZonePolicies', () => {
  it('reads the live rows and falls back to the seed on a missing table', async () => {
    const live = await readZonePolicies(
      adminWithZones([
        {
          id: 'eilat',
          name_he: 'אילת',
          flat_agorot: '3500',
          free_above_agorot: null,
          deliverable: true,
        },
      ]),
    )
    expect(live).toHaveLength(1)
    expect(live[0]?.flatAgorot).toBe(3500)
    const missing = await readZonePolicies(adminWithZones(null, { code: '42P01', message: 'no' }))
    expect(missing.map((z) => z.id)).toEqual(['center', 'north', 'south', 'eilat', 'remote'])
  })
})

describe('quoteCheckoutOptions', () => {
  const providers: CarrierProvider[] = [
    new MockCarrierProvider('israel_post', () => T0),
    new MockCarrierProvider('chita', () => T0),
  ]

  it('folds every carrier service into free options for a known city', async () => {
    const result = await quoteCheckoutOptions(
      adminWithZones([]),
      {
        cityName: 'תל אביב',
        zip: null,
        lines: [{ quantity: 2, weightGrams: null, lineTotalAgorot: agorot(9900) }],
      },
      { providers },
    )
    expect(result.zone).toBe('center')
    expect(result.weightGrams).toBe(2000)
    expect(result.degraded).toBe(false)
    expect(result.options.map((o) => o.id)).toEqual([
      'israel_post:locker',
      'israel_post:registered',
      'chita:standard',
      'israel_post:ems',
      'chita:express',
    ])
    expect(result.options.every((o) => o.shopperAgorot === 0)).toBe(true)
    expect(result.options.every((o) => Number.isInteger(o.carrierCostAgorot))).toBe(true)
  })

  it('drops a failing carrier, flags the result, and prices an unknown city as the centre', async () => {
    const broken: CarrierProvider = {
      carrierId: 'yamit',
      kind: 'http',
      quote: async () => {
        throw new Error('ECONNRESET')
      },
      createLabel: async () => {
        throw new Error('no')
      },
      track: async () => {
        throw new Error('no')
      },
    }
    const result = await quoteCheckoutOptions(
      adminWithZones([]),
      {
        cityName: 'כפר שלא קיים',
        zip: null,
        lines: [{ quantity: 1, weightGrams: 300, lineTotalAgorot: agorot(100) }],
      },
      { providers: [...providers, broken] },
    )
    expect(result.zone).toBeNull()
    expect(result.degraded).toBe(true)
    expect(result.options.some((o) => o.carrierId === 'yamit')).toBe(false)
    expect(result.options.length).toBeGreaterThan(0)
  })

  it('applies a live zone rate to the shopper price', async () => {
    const result = await quoteCheckoutOptions(
      adminWithZones([
        {
          id: 'eilat',
          name_he: 'אילת',
          flat_agorot: 3500,
          free_above_agorot: 50_000,
          deliverable: true,
        },
      ]),
      {
        cityName: 'אילת',
        zip: null,
        lines: [{ quantity: 1, weightGrams: null, lineTotalAgorot: agorot(10_000) }],
      },
      { providers },
    )
    expect(result.zone).toBe('eilat')
    expect(result.options.every((o) => o.shopperAgorot === 3500)).toBe(true)
  })
})
