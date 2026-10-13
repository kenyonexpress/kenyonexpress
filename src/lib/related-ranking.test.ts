import { describe, expect, it } from 'vitest'
import {
  PRICE_BAND_PERCENT,
  type RankableProduct,
  inPriceBand,
  rankRelated,
  sharedTagCount,
} from './related-ranking'

function item(id: string, priceAgorot: number | null, tags: string[] = []): RankableProduct {
  return { id, priceAgorot, tags }
}

const anchor = item('anchor', 10_000, ['ספא', 'זוגי'])

describe('sharedTagCount', () => {
  it('counts distinct tags in common, ignoring case and padding', () => {
    expect(sharedTagCount(['Spa', ' זוגי '], ['spa', 'זוגי', 'spa'])).toBe(2)
  })

  it('is zero when either side has no tags', () => {
    expect(sharedTagCount([], ['a'])).toBe(0)
    expect(sharedTagCount(['a'], [])).toBe(0)
    expect(sharedTagCount(['  '], ['  '])).toBe(0)
  })
})

describe('inPriceBand', () => {
  it('accepts a price up to the band edge on either side and rejects past it', () => {
    const edge = (10_000 * PRICE_BAND_PERCENT) / 100
    expect(inPriceBand(10_000, 10_000 + edge)).toBe(true)
    expect(inPriceBand(10_000, 10_000 - edge)).toBe(true)
    expect(inPriceBand(10_000, 10_000 + edge + 1)).toBe(false)
    expect(inPriceBand(10_000, 10_000 - edge - 1)).toBe(false)
  })

  it('is false when either price is missing or not positive', () => {
    expect(inPriceBand(null, 10_000)).toBe(false)
    expect(inPriceBand(10_000, null)).toBe(false)
    expect(inPriceBand(0, 0)).toBe(false)
  })
})

describe('rankRelated', () => {
  it('puts more shared tags first', () => {
    const ranked = rankRelated(
      anchor,
      [item('none', 10_000), item('one', 90_000, ['ספא']), item('two', 90_000, ['ספא', 'זוגי'])],
      3,
    )
    expect(ranked.map((p) => p.id)).toEqual(['two', 'one', 'none'])
  })

  it('never lets price closeness outrank a shared tag', () => {
    const ranked = rankRelated(
      anchor,
      [item('same-price-no-tag', 10_000), item('far-price-one-tag', 500_000, ['ספא'])],
      2,
    )
    expect(ranked.map((p) => p.id)).toEqual(['far-price-one-tag', 'same-price-no-tag'])
  })

  it('orders equal tag overlap by distance from the anchor price', () => {
    const ranked = rankRelated(
      anchor,
      [item('out-of-band', 20_000), item('near', 10_500), item('nearer', 10_100)],
      3,
    )
    expect(ranked.map((p) => p.id)).toEqual(['nearer', 'near', 'out-of-band'])
  })

  it('keeps the incoming order on a tie, which is newest first', () => {
    const pool = [item('newest', null), item('older', null), item('oldest', null)]
    expect(rankRelated(anchor, pool, 3).map((p) => p.id)).toEqual(['newest', 'older', 'oldest'])
  })

  it('drops the anchor from its own recommendations and respects the limit', () => {
    const pool = [item('anchor', 10_000, ['ספא', 'זוגי']), item('a', 10_000), item('b', 10_000)]
    expect(rankRelated(anchor, pool, 1).map((p) => p.id)).toEqual(['a'])
  })

  it('falls back to the incoming order when there is no anchor', () => {
    const pool = [item('a', 1), item('b', 2)]
    expect(rankRelated(null, pool, 5).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the pool', () => {
    const pool = [item('a', 90_000), item('b', 10_000, ['ספא'])]
    rankRelated(anchor, pool, 2)
    expect(pool.map((p) => p.id)).toEqual(['a', 'b'])
  })
})
