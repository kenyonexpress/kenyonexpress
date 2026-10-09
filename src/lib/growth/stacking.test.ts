import { describe, expect, it } from 'vitest'
import type { DiscountCampaign } from './discount'
import { MAX_STACKED_CODES, evaluateDiscountStack } from './stacking'

const NOW = new Date('2026-09-10T12:00:00Z')

function campaign(over: Partial<DiscountCampaign> = {}): DiscountCampaign {
  return {
    id: over.code ?? 'c1',
    code: 'SUMMER',
    name: 'Summer',
    kind: 'percent',
    percent_bp: 1000, // 10%
    amount_agorot: null,
    min_order_agorot: 0,
    max_discount_agorot: null,
    starts_at: null,
    expires_at: null,
    max_uses: null,
    max_uses_per_user: 1,
    used_count: 0,
    allow_stacking: true,
    is_active: true,
    ...over,
  }
}

/** Plenty of commission, so the shared ceiling does not bind by accident. */
const ROOMY = { payableAgorot: 100_00, commissionAgorot: 80_00 }

describe('evaluateDiscountStack', () => {
  it('applies a single code exactly as the engine prices it', () => {
    const out = evaluateDiscountStack([campaign({ code: 'A', id: 'a' })], ROOMY, NOW)
    expect(out.applied).toHaveLength(1)
    expect(out.totalAgorot).toBe(10_00)
    expect(out.refused).toHaveLength(0)
  })

  it('stacks two opted-in codes sequentially, the second on the remainder', () => {
    const out = evaluateDiscountStack(
      [
        campaign({ code: 'A', id: 'a' }), // 10% of 100.00 = 10.00
        campaign({ code: 'B', id: 'b' }), // 10% of the remaining 90.00 = 9.00
      ],
      ROOMY,
      NOW,
    )
    expect(out.applied.map((entry) => entry.discountAgorot)).toEqual([10_00, 9_00])
    expect(out.totalAgorot).toBe(19_00)
  })

  it('a non-stackable code cannot join an existing stack', () => {
    const out = evaluateDiscountStack(
      [campaign({ code: 'A', id: 'a' }), campaign({ code: 'B', id: 'b', allow_stacking: false })],
      ROOMY,
      NOW,
    )
    expect(out.applied.map((entry) => entry.code)).toEqual(['A'])
    expect(out.refused).toEqual([
      expect.objectContaining({ code: 'B', reason: 'stacking-not-allowed' }),
    ])
  })

  it('nothing can join a stack whose first member is exclusive', () => {
    const out = evaluateDiscountStack(
      [campaign({ code: 'A', id: 'a', allow_stacking: false }), campaign({ code: 'B', id: 'b' })],
      ROOMY,
      NOW,
    )
    expect(out.applied.map((entry) => entry.code)).toEqual(['A'])
    expect(out.refused).toEqual([
      expect.objectContaining({ code: 'B', reason: 'stacking-not-allowed' }),
    ])
  })

  it('the same campaign entered twice refuses rather than silently deduping', () => {
    const one = campaign({ code: 'A', id: 'a' })
    const out = evaluateDiscountStack([one, one], ROOMY, NOW)
    expect(out.applied).toHaveLength(1)
    expect(out.refused[0]?.reason).toBe('stacking-not-allowed')
  })

  it('the shared commission ceiling binds the TOTAL, not each code alone', () => {
    // Two 60% codes against 100.00 payable but only 70.00 commission: the
    // first takes 60.00, the second gets what the ceiling left (10.00), and
    // together they can never exceed the commission that funds them.
    const out = evaluateDiscountStack(
      [
        campaign({ code: 'A', id: 'a', percent_bp: 6000 }),
        campaign({ code: 'B', id: 'b', percent_bp: 6000 }),
      ],
      { payableAgorot: 100_00, commissionAgorot: 70_00 },
      NOW,
    )
    expect(out.totalAgorot).toBe(70_00)
    expect(out.applied[1]?.cappedBy).toBe('commission')
  })

  it('a refused code in the middle costs that code and nothing else', () => {
    const out = evaluateDiscountStack(
      [
        campaign({ code: 'A', id: 'a' }),
        campaign({ code: 'DEAD', id: 'dead', is_active: false }),
        campaign({ code: 'C', id: 'c' }),
      ],
      ROOMY,
      NOW,
    )
    expect(out.applied.map((entry) => entry.code)).toEqual(['A', 'C'])
    expect(out.refused).toEqual([expect.objectContaining({ code: 'DEAD', reason: 'inactive' })])
  })

  it('refuses codes past the stack cap', () => {
    const codes = ['A', 'B', 'C', 'D'].map((code) => campaign({ code, id: code.toLowerCase() }))
    const out = evaluateDiscountStack(codes, ROOMY, NOW)
    expect(out.applied).toHaveLength(MAX_STACKED_CODES)
    expect(out.refused).toEqual([expect.objectContaining({ code: 'D', reason: 'stack-full' })])
  })

  it('a gift card in the cart refuses every code with the real reason', () => {
    const out = evaluateDiscountStack(
      [campaign({ code: 'A', id: 'a' })],
      { ...ROOMY, giftCardInCart: true },
      NOW,
    )
    expect(out.applied).toHaveLength(0)
    expect(out.refused[0]?.reason).toBe('gift-card-in-cart')
  })

  it('a null campaign (code that resolved to nothing) refuses as unknown', () => {
    const out = evaluateDiscountStack([null], ROOMY, NOW)
    expect(out.applied).toHaveLength(0)
    expect(out.refused[0]?.reason).toBe('unknown')
  })
})
