import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  type AffiliateCampaign,
  type ConversionLine,
  type DecisionInput,
  campaignFromRow,
  campaignIsLive,
  commissionBase,
  computeCommission,
  decideConversion,
  linesInScope,
  selectCampaign,
} from './commission'

const NOW = new Date('2026-09-25T12:00:00Z')

function campaign(over: Partial<AffiliateCampaign> = {}): AffiliateCampaign {
  return {
    id: over.id ?? 'c1',
    name: 'קמפיין',
    commissionBp: 1000,
    minOrderAgorot: agorot(0),
    maxCommissionAgorot: null,
    budgetAgorot: null,
    maxConversionsPerDay: 20,
    requiresManualApproval: false,
    startsAt: '2026-09-01T00:00:00Z',
    endsAt: null,
    isActive: true,
    categoryId: null,
    productId: null,
    ...over,
  }
}

function line(paid: number, over: Partial<ConversionLine> = {}): ConversionLine {
  return { productId: 'p1', categoryId: 'cat1', paidOnSiteAgorot: agorot(paid), ...over }
}

function input(over: Partial<DecisionInput> = {}): DecisionInput {
  return {
    affiliate: { userId: 'aff', status: 'approved' },
    buyerUserId: 'buyer',
    campaign: campaign(),
    lines: [line(10_000)],
    fraudSignals: [],
    conversionsLast24h: 0,
    campaignCommittedAgorot: agorot(0),
    referralBonusPaidToAffiliate: false,
    ...over,
  }
}

describe('campaignIsLive', () => {
  it('is off when inactive, before the start, or at the end', () => {
    expect(campaignIsLive(campaign({ isActive: false }), NOW)).toBe(false)
    expect(campaignIsLive(campaign({ startsAt: '2026-10-01T00:00:00Z' }), NOW)).toBe(false)
    expect(campaignIsLive(campaign({ endsAt: '2026-09-25T12:00:00Z' }), NOW)).toBe(false)
    expect(campaignIsLive(campaign({ endsAt: '2026-09-25T12:00:01Z' }), NOW)).toBe(true)
  })
})

describe('scope', () => {
  it('site-wide covers every line, product and category narrow it', () => {
    const lines = [line(100), line(200, { productId: 'p2', categoryId: 'cat2' })]
    expect(linesInScope(campaign(), lines)).toHaveLength(2)
    expect(linesInScope(campaign({ productId: 'p2' }), lines)).toEqual([lines[1]])
    expect(linesInScope(campaign({ categoryId: 'cat1' }), lines)).toEqual([lines[0]])
  })

  it('the base is the in-scope lines only, integer agorot', () => {
    const lines = [line(1_000), line(2_000, { productId: 'p2' })]
    expect(commissionBase(campaign(), lines)).toBe(3_000)
    expect(commissionBase(campaign({ productId: 'p2' }), lines)).toBe(2_000)
  })
})

describe('selectCampaign', () => {
  it('prefers product over category over site-wide, then the higher commission', () => {
    const lines = [line(1_000)]
    const site = campaign({ id: 'site', commissionBp: 3000 })
    const cat = campaign({ id: 'cat', categoryId: 'cat1', commissionBp: 500 })
    const prod = campaign({ id: 'prod', productId: 'p1', commissionBp: 100 })
    expect(selectCampaign([site, cat, prod], lines, NOW)?.id).toBe('prod')
    expect(selectCampaign([site, cat], lines, NOW)?.id).toBe('cat')
    const site2 = campaign({ id: 'site2', commissionBp: 4000 })
    expect(selectCampaign([site, site2], lines, NOW)?.id).toBe('site2')
  })

  it('ignores campaigns that are not live or that cover none of the lines', () => {
    const lines = [line(1_000)]
    const dead = campaign({ id: 'dead', isActive: false })
    const other = campaign({ id: 'other', productId: 'p9' })
    expect(selectCampaign([dead, other], lines, NOW)).toBeNull()
  })
})

describe('computeCommission', () => {
  it('applies basis points with half-up rounding', () => {
    // 12.5% of 1,005 agorot = 125.625 -> 126
    expect(computeCommission(agorot(1_005), campaign({ commissionBp: 1250 }))).toBe(126)
  })

  it('caps at the campaign ceiling', () => {
    expect(computeCommission(agorot(100_000), campaign({ maxCommissionAgorot: agorot(500) }))).toBe(
      500,
    )
  })
})

describe('decideConversion', () => {
  it('pays a clean order at once: pending, no flags', () => {
    expect(decideConversion(input())).toEqual({
      kind: 'record',
      status: 'pending',
      baseAgorot: 10_000,
      commissionAgorot: 1_000,
      flaggedReasons: [],
    })
  })

  it('skips silently when the affiliate is not approved or there is no campaign', () => {
    expect(
      decideConversion(input({ affiliate: { userId: 'aff', status: 'pending_review' } })),
    ).toEqual({
      kind: 'skip',
      reason: 'affiliate_not_approved',
    })
    expect(decideConversion(input({ campaign: null }))).toEqual({
      kind: 'skip',
      reason: 'no_live_campaign',
    })
  })

  it('refuses a self purchase and records it, before any campaign arithmetic', () => {
    const decision = decideConversion(input({ buyerUserId: 'aff' }))
    expect(decision).toEqual({ kind: 'refuse', reason: 'self_purchase', baseAgorot: 10_000 })
  })

  it('refuses when the same order already paid this affiliate a referral bonus', () => {
    expect(decideConversion(input({ referralBonusPaidToAffiliate: true }))).toMatchObject({
      kind: 'refuse',
      reason: 'referral_bonus_paid',
    })
  })

  it('skips under the minimum and when the commission rounds to zero', () => {
    expect(
      decideConversion(input({ campaign: campaign({ minOrderAgorot: agorot(20_000) }) })),
    ).toEqual({ kind: 'skip', reason: 'below_minimum' })
    expect(
      decideConversion(input({ lines: [line(4)], campaign: campaign({ commissionBp: 1000 }) })),
    ).toEqual({ kind: 'skip', reason: 'zero_commission' })
  })

  it('skips when the budget would be exceeded, counting what is already committed', () => {
    const c = campaign({ budgetAgorot: agorot(1_500) })
    expect(decideConversion(input({ campaign: c, campaignCommittedAgorot: agorot(600) }))).toEqual({
      kind: 'skip',
      reason: 'budget_exhausted',
    })
    expect(
      decideConversion(input({ campaign: c, campaignCommittedAgorot: agorot(500) })),
    ).toMatchObject({
      kind: 'record',
      status: 'pending',
    })
  })

  it('flags, never refuses, on shared device/ip/card, velocity and manual approval', () => {
    const decision = decideConversion(
      input({
        fraudSignals: ['same_device', 'same_ip', 'unknown_signal'],
        conversionsLast24h: 20,
        campaign: campaign({ requiresManualApproval: true }),
      }),
    )
    expect(decision).toEqual({
      kind: 'record',
      status: 'flagged',
      baseAgorot: 10_000,
      commissionAgorot: 1_000,
      flaggedReasons: ['same_device', 'same_ip', 'velocity', 'manual_approval'],
    })
  })

  it('does not flag velocity one below the daily cap', () => {
    expect(decideConversion(input({ conversionsLast24h: 19 }))).toMatchObject({ status: 'pending' })
  })
})

describe('campaignFromRow', () => {
  it('reads integer columns as agorot and treats a soft-deleted row as inactive', () => {
    const c = campaignFromRow({
      id: 'x',
      name: 'n',
      commission_bp: 750,
      min_order_agorot: 5_000,
      max_commission_agorot: null,
      budget_agorot: 100_000,
      max_conversions_per_day: 5,
      require_manual_approval: false,
      starts_at: '2026-09-01T00:00:00Z',
      ends_at: null,
      is_active: true,
      category_id: null,
      product_id: null,
      deleted_at: '2026-09-02T00:00:00Z',
    })
    expect(c.commissionBp).toBe(750)
    expect(c.minOrderAgorot).toBe(5_000)
    expect(c.budgetAgorot).toBe(100_000)
    expect(c.maxCommissionAgorot).toBeNull()
    expect(c.isActive).toBe(false)
  })
})
