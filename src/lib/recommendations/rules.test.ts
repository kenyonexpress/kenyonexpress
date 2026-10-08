import { describe, expect, it } from 'vitest'
import {
  MAX_BASKET_SIZE,
  MAX_SEEDS,
  MIN_STRIP,
  PRICE_BAND_MIN_AGOROT,
  STRIP_SIZE,
  basketsFromRows,
  buildCooccurrence,
  dedupeStrips,
  neighboursOf,
  neighboursOfMany,
  priceBand,
  rankBySimilarPrice,
  sanitizeSeedIds,
  stripOrNothing,
} from './rules'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'

describe('buildCooccurrence', () => {
  it('counts each basket once per pair, symmetrically, however many units it holds', () => {
    const m = buildCooccurrence([
      { key: 'o1', productIds: [A, B, B, B] },
      { key: 'o2', productIds: [A, B, C] },
    ])
    expect(m.get(A)?.get(B)).toBe(2)
    expect(m.get(B)?.get(A)).toBe(2)
    expect(m.get(A)?.get(C)).toBe(1)
    expect(m.get(A)?.get(A)).toBeUndefined()
  })

  it('ignores single-product baskets, repeated keys and bulk baskets', () => {
    const bulk = Array.from({ length: MAX_BASKET_SIZE + 1 }, (_, i) => `p${i}`)
    const m = buildCooccurrence([
      { key: 'solo', productIds: [A] },
      { key: 'dup', productIds: [A, B] },
      { key: 'dup', productIds: [A, B] },
      { key: 'bot', productIds: bulk },
    ])
    expect(m.get(A)?.get(B)).toBe(1)
    expect(m.get('p0')).toBeUndefined()
  })
})

describe('neighboursOf', () => {
  const m = buildCooccurrence([
    { key: '1', productIds: [A, B] },
    { key: '2', productIds: [A, B] },
    { key: '3', productIds: [A, C] },
    { key: '4', productIds: [A, C] },
    { key: '5', productIds: [A, C] },
    { key: '6', productIds: [A, D] },
  ])

  it('ranks by support and drops pairs under the floor', () => {
    // D was seen once with A: one shopper, not a signal.
    expect(neighboursOf(m, A)).toEqual([
      { productId: C, support: 3 },
      { productId: B, support: 2 },
    ])
  })

  it('honours exclude and limit, and returns nothing for an unknown seed', () => {
    expect(neighboursOf(m, A, { exclude: new Set([C]), limit: 1 })).toEqual([
      { productId: B, support: 2 },
    ])
    expect(neighboursOf(m, 'nope')).toEqual([])
  })

  it('breaks ties by id so the strip is stable', () => {
    const tie = buildCooccurrence([
      { key: '1', productIds: [A, C, B] },
      { key: '2', productIds: [A, C, B] },
    ])
    expect(neighboursOf(tie, A).map((n) => n.productId)).toEqual([B, C])
  })
})

describe('neighboursOfMany', () => {
  it('sums support across seeds and never recommends a seed back', () => {
    const m = buildCooccurrence([
      { key: '1', productIds: [A, C] },
      { key: '2', productIds: [A, C] },
      { key: '3', productIds: [B, C] },
      { key: '4', productIds: [B, C] },
      { key: '5', productIds: [B, D] },
      { key: '6', productIds: [B, D] },
      { key: '7', productIds: [A, B] },
      { key: '8', productIds: [A, B] },
    ])
    expect(neighboursOfMany(m, [A, B])).toEqual([
      { productId: C, support: 4 },
      { productId: D, support: 2 },
    ])
  })
})

describe('priceBand', () => {
  it('is ±25% of the seed price in integer agorot', () => {
    expect(priceBand(40_000)).toEqual({ minAgorot: 30_000, maxAgorot: 50_000 })
  })

  it('never narrows below the minimum half-width and never goes negative', () => {
    expect(priceBand(2_000)).toEqual({ minAgorot: 1_000, maxAgorot: 2_000 + PRICE_BAND_MIN_AGOROT })
    expect(priceBand(500)).toEqual({ minAgorot: 0, maxAgorot: 1_500 })
  })

  it('refuses a price that is not a positive integer', () => {
    expect(priceBand(0)).toBeNull()
    expect(priceBand(-1)).toBeNull()
    expect(priceBand(12.5)).toBeNull()
    expect(priceBand(Number.NaN)).toBeNull()
  })
})

describe('rankBySimilarPrice', () => {
  it('orders by distance to the seed and drops the unpriced, the excluded and repeats', () => {
    const ranked = rankBySimilarPrice(
      [
        { id: 'far', priceAgorot: 9_000 },
        { id: 'near', priceAgorot: 10_100 },
        { id: 'none', priceAgorot: null },
        { id: 'self', priceAgorot: 10_000 },
        { id: 'near', priceAgorot: 10_100 },
        { id: 'mid', priceAgorot: 10_500 },
      ],
      10_000,
      { exclude: new Set(['self']), limit: 2 },
    )
    expect(ranked.map((c) => c.id)).toEqual(['near', 'mid'])
  })
})

describe('stripOrNothing and dedupeStrips', () => {
  const p = (id: string) => ({ id })

  it('empties a strip under the floor', () => {
    expect(stripOrNothing([p('a')])).toEqual([])
    expect(stripOrNothing([p('a'), p('b')])).toHaveLength(MIN_STRIP)
  })

  it('never shows a card twice, bought-together keeps its cards, and the floor applies after dedupe', () => {
    const out = dedupeStrips({
      boughtTogether: [p('a'), p('b')],
      viewedTogether: [p('a'), p('c'), p('d')],
      similarPrice: [p('b'), p('c'), p('e')],
    })
    expect(out.boughtTogether.map((x) => x.id)).toEqual(['a', 'b'])
    expect(out.viewedTogether.map((x) => x.id)).toEqual(['c', 'd'])
    // 'e' alone is under the floor once b and c are taken.
    expect(out.similarPrice).toEqual([])
  })

  it('caps every strip at the live row width', () => {
    const many = Array.from({ length: 9 }, (_, i) => p(`x${i}`))
    const out = dedupeStrips({ boughtTogether: many, viewedTogether: [], similarPrice: [] })
    expect(out.boughtTogether).toHaveLength(STRIP_SIZE)
  })
})

describe('sanitizeSeedIds', () => {
  it('keeps only distinct UUIDs, lower-cased, capped', () => {
    const upper = A.toUpperCase()
    expect(sanitizeSeedIds([upper, A, 'drop-table', 42, ` ${B} `])).toEqual([A, B])
    const flood = Array.from(
      { length: 40 },
      (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    )
    expect(sanitizeSeedIds(flood)).toHaveLength(MAX_SEEDS)
  })
})

describe('basketsFromRows', () => {
  it('groups flat rows by key and drops blanks', () => {
    expect(
      basketsFromRows([
        { key: 's1', productId: A },
        { key: 's1', productId: B },
        { key: '', productId: C },
        { key: 's2', productId: '' },
        { key: 's2', productId: D },
      ]),
    ).toEqual([
      { key: 's1', productIds: [A, B] },
      { key: 's2', productIds: [D] },
    ])
  })
})
