import { describe, expect, it } from 'vitest'
import { type DiscountCampaign, evaluateDiscount } from './discount'
import { evaluateDiscountStack } from './stacking'

/**
 * Tier-only deals (STEP 47). A campaign carrying `min_loyalty_tier` is a
 * code the cart refuses below that tier, and the refusal names the tier.
 */

const NOW = new Date('2026-10-08T12:00:00Z')

function campaign(over: Partial<DiscountCampaign> = {}): DiscountCampaign {
  return {
    id: 'c-gold',
    code: 'GOLD20',
    name: 'Gold members',
    kind: 'percent',
    percent_bp: 2000,
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
    min_loyalty_tier: 'gold',
    ...over,
  }
}

const ROOMY = { payableAgorot: 100_00, commissionAgorot: 50_00 }

describe('evaluateDiscount with a minimum tier', () => {
  it('admits the tier itself and above, and prices as usual', () => {
    const gold = evaluateDiscount(campaign(), { ...ROOMY, loyaltyTier: 'gold' }, NOW)
    expect(gold.ok).toBe(true)
    if (gold.ok) expect(gold.discountAgorot).toBe(20_00)

    const silverCode = campaign({ min_loyalty_tier: 'silver', code: 'SILVER10' })
    expect(evaluateDiscount(silverCode, { ...ROOMY, loyaltyTier: 'silver' }, NOW).ok).toBe(true)
    expect(evaluateDiscount(silverCode, { ...ROOMY, loyaltyTier: 'gold' }, NOW).ok).toBe(true)
  })

  it('refuses a lower tier and says which tier the code needs', () => {
    const out = evaluateDiscount(campaign(), { ...ROOMY, loyaltyTier: 'silver' }, NOW)
    expect(out).toEqual({
      ok: false,
      reason: 'tier-required',
      message: 'הקוד הזה שמור לחברי מועדון בדרגת זהב',
    })
    const silver = evaluateDiscount(
      campaign({ min_loyalty_tier: 'silver' }),
      { ...ROOMY, loyaltyTier: 'bronze' },
      NOW,
    )
    expect(silver.ok).toBe(false)
    if (!silver.ok) expect(silver.message).toBe('הקוד הזה שמור לחברי מועדון בדרגת כסף ומעלה')
  })

  it('refuses a guest and a cart that did not say, which is the same thing', () => {
    expect(evaluateDiscount(campaign(), { ...ROOMY, loyaltyTier: null }, NOW).ok).toBe(false)
    expect(evaluateDiscount(campaign(), ROOMY, NOW).ok).toBe(false)
  })

  it('leaves an open campaign open to everyone, including before 261 when the field is absent', () => {
    const open = campaign({ min_loyalty_tier: null })
    expect(evaluateDiscount(open, { ...ROOMY, loyaltyTier: null }, NOW).ok).toBe(true)
    const { min_loyalty_tier: _absent, ...legacy } = campaign()
    expect(evaluateDiscount(legacy, ROOMY, NOW).ok).toBe(true)
  })

  it('checks the tier before the amount, so a locked code never quotes a number', () => {
    // Below the minimum order AND below the tier: the tier is the answer.
    const out = evaluateDiscount(
      campaign({ min_order_agorot: 500_00 }),
      { ...ROOMY, loyaltyTier: 'bronze' },
      NOW,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('tier-required')
  })

  it('still refuses an inactive or expired gated code on those grounds first', () => {
    const out = evaluateDiscount(
      campaign({ is_active: false }),
      { ...ROOMY, loyaltyTier: 'gold' },
      NOW,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('inactive')
  })
})

describe('evaluateDiscountStack carries the tier through', () => {
  it('applies the open code and refuses the gated one for a bronze shopper', () => {
    const open = campaign({ id: 'c-open', code: 'OPEN5', percent_bp: 500, min_loyalty_tier: null })
    const out = evaluateDiscountStack([open, campaign()], { ...ROOMY, loyaltyTier: 'bronze' }, NOW)
    expect(out.applied.map((a) => a.code)).toEqual(['OPEN5'])
    expect(out.refused).toEqual([
      { code: 'GOLD20', reason: 'tier-required', message: 'הקוד הזה שמור לחברי מועדון בדרגת זהב' },
    ])
  })

  it('applies both for a gold shopper', () => {
    const open = campaign({ id: 'c-open', code: 'OPEN5', percent_bp: 500, min_loyalty_tier: null })
    const out = evaluateDiscountStack([open, campaign()], { ...ROOMY, loyaltyTier: 'gold' }, NOW)
    expect(out.applied.map((a) => a.code)).toEqual(['OPEN5', 'GOLD20'])
    expect(out.refused).toEqual([])
  })
})
