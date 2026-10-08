import { type BundleDefinition, evaluateBundles, isBundleOpen } from '@/lib/bundles/evaluate'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-10-08T12:00:00Z')

function bundle(overrides: Partial<BundleDefinition> = {}): BundleDefinition {
  return {
    id: 'b1',
    name_he: 'ספל וצלחת',
    discount_agorot: 3000,
    starts_at: null,
    expires_at: null,
    items: [
      { product_id: 'mug', quantity: 1 },
      { product_id: 'plate', quantity: 1 },
    ],
    ...overrides,
  }
}

function line(product_id: string, quantity: number, unitAgorot: number) {
  return { product_id, quantity, customer_pays_now: agorot(unitAgorot * quantity) }
}

describe('evaluateBundles', () => {
  it('applies nothing to an empty cart or with no rules', () => {
    expect(evaluateBundles([], [line('mug', 1, 5000)], NOW)).toEqual({ applied: [], total: 0 })
    expect(evaluateBundles([bundle()], [], NOW)).toEqual({ applied: [], total: 0 })
  })

  it('applies a complete set once and reports the fixed amount', () => {
    const result = evaluateBundles([bundle()], [line('mug', 1, 5000), line('plate', 1, 7000)], NOW)
    expect(result.applied).toEqual([{ id: 'b1', name_he: 'ספל וצלחת', times: 1, discount: 3000 }])
    expect(result.total).toBe(3000)
    expect(Number.isInteger(result.total)).toBe(true)
  })

  it('does not apply when one member is missing or short', () => {
    expect(evaluateBundles([bundle()], [line('mug', 1, 5000)], NOW).applied).toEqual([])
    const twoMugs = bundle({ items: [{ product_id: 'mug', quantity: 2 }] })
    expect(evaluateBundles([twoMugs], [line('mug', 1, 5000)], NOW).applied).toEqual([])
  })

  it('counts complete sets and multiplies the saving by that count', () => {
    const result = evaluateBundles([bundle()], [line('mug', 3, 5000), line('plate', 2, 7000)], NOW)
    expect(result.applied[0]?.times).toBe(2)
    expect(result.total).toBe(6000)
  })

  it('sums a product across its variants (rule 3)', () => {
    const twoShirts = bundle({ items: [{ product_id: 'shirt', quantity: 2 }] })
    const result = evaluateBundles(
      [twoShirts],
      [line('shirt', 1, 8000), line('shirt', 1, 9000)],
      NOW,
    )
    expect(result.applied[0]?.times).toBe(1)
  })

  it('lets one unit serve one bundle only, the richer bundle first (rule 1)', () => {
    const mugPlate = bundle({ id: 'cheap', discount_agorot: 1000 })
    const mugBowl = bundle({
      id: 'rich',
      discount_agorot: 2500,
      items: [
        { product_id: 'mug', quantity: 1 },
        { product_id: 'bowl', quantity: 1 },
      ],
    })
    const result = evaluateBundles(
      [mugPlate, mugBowl],
      [line('mug', 1, 5000), line('plate', 1, 7000), line('bowl', 1, 6000)],
      NOW,
    )
    expect(result.applied.map((b) => b.id)).toEqual(['rich'])
    expect(result.total).toBe(2500)

    const withTwoMugs = evaluateBundles(
      [mugPlate, mugBowl],
      [line('mug', 2, 5000), line('plate', 1, 7000), line('bowl', 1, 6000)],
      NOW,
    )
    expect(withTwoMugs.applied.map((b) => b.id)).toEqual(['rich', 'cheap'])
    expect(withTwoMugs.total).toBe(3500)
  })

  it('is deterministic across input order', () => {
    const a = bundle({ id: 'a', discount_agorot: 1000 })
    const b = bundle({ id: 'b', discount_agorot: 1000 })
    const lines = [line('mug', 1, 5000), line('plate', 1, 7000)]
    expect(evaluateBundles([a, b], lines, NOW).applied.map((x) => x.id)).toEqual(['a'])
    expect(evaluateBundles([b, a], lines, NOW).applied.map((x) => x.id)).toEqual(['a'])
  })

  it('caps the saving at what the consumed units cost on site (rule 2)', () => {
    const generous = bundle({ discount_agorot: 30000 })
    const result = evaluateBundles([generous], [line('mug', 1, 1000), line('plate', 1, 1500)], NOW)
    expect(result.total).toBe(2500)
  })

  it('caps on the consumed share, not the whole line, when extra units are held', () => {
    const generous = bundle({ discount_agorot: 30000 })
    // Three mugs held, one consumed: the cap counts one mug and one plate.
    const result = evaluateBundles([generous], [line('mug', 3, 1000), line('plate', 1, 1500)], NOW)
    expect(result.total).toBe(2500)
  })

  it('ignores a bundle with no usable rows, a non-positive amount, or a closed window', () => {
    const empty = bundle({ id: 'empty', items: [] })
    const zeroQty = bundle({ id: 'zq', items: [{ product_id: 'mug', quantity: 0 }] })
    const free = bundle({ id: 'free', discount_agorot: 0 })
    const fractional = bundle({ id: 'frac', discount_agorot: 10.5 })
    const expired = bundle({ id: 'old', expires_at: '2026-10-01T00:00:00Z' })
    const future = bundle({ id: 'soon', starts_at: '2026-11-01T00:00:00Z' })
    const lines = [line('mug', 1, 5000), line('plate', 1, 7000)]
    expect(
      evaluateBundles([empty, zeroQty, free, fractional, expired, future], lines, NOW).applied,
    ).toEqual([])
  })

  it('merges a product named twice in one rule into one quantity', () => {
    const doubled = bundle({
      items: [
        { product_id: 'mug', quantity: 1 },
        { product_id: 'mug', quantity: 1 },
      ],
    })
    expect(evaluateBundles([doubled], [line('mug', 1, 5000)], NOW).applied).toEqual([])
    expect(evaluateBundles([doubled], [line('mug', 2, 5000)], NOW).applied[0]?.times).toBe(1)
  })
})

describe('isBundleOpen', () => {
  it('treats null bounds as open and judges both edges', () => {
    expect(isBundleOpen({ starts_at: null, expires_at: null }, NOW)).toBe(true)
    expect(isBundleOpen({ starts_at: '2026-10-08T12:00:00Z', expires_at: null }, NOW)).toBe(true)
    expect(isBundleOpen({ starts_at: null, expires_at: '2026-10-08T12:00:00Z' }, NOW)).toBe(false)
    expect(isBundleOpen({ starts_at: 'garbage', expires_at: null }, NOW)).toBe(false)
  })
})
