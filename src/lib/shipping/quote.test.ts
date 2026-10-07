import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import type { CarrierQuote } from './providers/types'
import {
  DEFAULT_UNIT_WEIGHT_GRAMS,
  buildShippingOptions,
  declaredValueAgorot,
  estimateParcelWeightGrams,
  parseShippingOptionId,
  shippingOptionId,
} from './quote'
import { ZONE_SEED } from './zones'

const quotes: CarrierQuote[] = [
  {
    carrierId: 'chita',
    serviceCode: 'express',
    carrierCostAgorot: agorot(4784),
    minDays: 1,
    maxDays: 1,
    quoteRef: null,
  },
  {
    carrierId: 'israel_post',
    serviceCode: 'registered',
    carrierCostAgorot: agorot(1890),
    minDays: 3,
    maxDays: 7,
    quoteRef: 'q1',
  },
  {
    carrierId: 'yamit',
    serviceCode: 'standard',
    carrierCostAgorot: agorot(2790),
    minDays: 2,
    maxDays: 4,
    quoteRef: null,
  },
]

describe('buildShippingOptions', () => {
  it('charges the shopper the zone rate, not the carrier cost, and keeps both', () => {
    const options = buildShippingOptions({
      quotes,
      zone: 'center',
      policy: ZONE_SEED[0]!,
      subtotalAgorot: agorot(15_000),
    })
    expect(options.map((o) => o.id)).toEqual([
      'israel_post:registered',
      'yamit:standard',
      'chita:express',
    ])
    for (const o of options) expect(o.shopperAgorot).toBe(0)
    expect(options[0]).toMatchObject({
      carrierLabel: 'דואר ישראל',
      serviceLabel: 'דואר רשום עד הבית',
      etaLabel: '3-7 ימי עסקים',
      carrierCostAgorot: 1890,
      quoteRef: 'q1',
    })
    expect(options[2]?.etaLabel).toBe('1 ימי עסקים')
  })

  it('passes a non-zero zone rate through when the table says so', () => {
    const policy = { ...ZONE_SEED[3]!, flatAgorot: agorot(3500), freeAboveAgorot: agorot(30_000) }
    const below = buildShippingOptions({
      quotes,
      zone: 'eilat',
      policy,
      subtotalAgorot: agorot(10_000),
    })
    const above = buildShippingOptions({
      quotes,
      zone: 'eilat',
      policy,
      subtotalAgorot: agorot(30_000),
    })
    expect(below.every((o) => o.shopperAgorot === 3500)).toBe(true)
    expect(above.every((o) => o.shopperAgorot === 0)).toBe(true)
  })

  it('offers nothing for an undeliverable zone', () => {
    const policy = { ...ZONE_SEED[4]!, deliverable: false }
    expect(
      buildShippingOptions({ quotes, zone: 'remote', policy, subtotalAgorot: agorot(1) }),
    ).toEqual([])
  })

  it('round-trips the option id', () => {
    expect(shippingOptionId('chita', 'express')).toBe('chita:express')
    expect(parseShippingOptionId('chita:express')).toEqual({
      carrierId: 'chita',
      serviceCode: 'express',
    })
    expect(parseShippingOptionId('chita:')).toBeNull()
    expect(parseShippingOptionId(':x')).toBeNull()
    expect(parseShippingOptionId(42)).toBeNull()
  })
})

describe('parcel facts', () => {
  it('weighs a kilogram per unit when the product has no weight', () => {
    expect(DEFAULT_UNIT_WEIGHT_GRAMS).toBe(1000)
    expect(estimateParcelWeightGrams([{ quantity: 2, weightGrams: null }])).toBe(2000)
    expect(estimateParcelWeightGrams([{ quantity: 3, weightGrams: 250 }])).toBe(750)
    expect(estimateParcelWeightGrams([{ quantity: 1, weightGrams: 0 }])).toBe(1000)
    expect(estimateParcelWeightGrams([])).toBe(100)
  })

  it('sums declared value in integer agorot', () => {
    expect(declaredValueAgorot([agorot(1999), agorot(1)])).toBe(2000)
  })
})
