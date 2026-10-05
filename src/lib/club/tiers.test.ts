import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  CLUB_SPEND_STATUSES,
  CLUB_TIERS,
  CLUB_TIER_IDS,
  type ClubTier,
  clubStanding,
  clubTierForSpend,
  clubWindowStart,
  isClubTierId,
  sumClubSpend,
  tiersFromRows,
} from './tiers'

const now = new Date('2026-09-25T12:00:00Z')

function row(overrides: Partial<Parameters<typeof sumClubSpend>[0][number]> = {}) {
  return {
    status: 'paid',
    paid_at: '2026-09-01T10:00:00Z',
    created_at: '2026-09-01T09:58:00Z',
    totalAgorot: agorot(10_000),
    ...overrides,
  }
}

describe('club tiers: thresholds', () => {
  it('are ascending integer agorot with a zero floor', () => {
    expect(CLUB_TIERS[0]?.minAgorot).toBe(0)
    for (let i = 1; i < CLUB_TIERS.length; i++) {
      const tier = CLUB_TIERS[i]
      const below = CLUB_TIERS[i - 1]
      expect(Number.isSafeInteger(tier?.minAgorot)).toBe(true)
      expect(tier?.minAgorot ?? 0).toBeGreaterThan(below?.minAgorot ?? 0)
    }
  })

  it('assign the tier as a step function on the boundary itself', () => {
    expect(clubTierForSpend(agorot(0)).id).toBe('member')
    expect(clubTierForSpend(agorot(99_999)).id).toBe('member')
    expect(clubTierForSpend(agorot(100_000)).id).toBe('silver')
    expect(clubTierForSpend(agorot(299_999)).id).toBe('silver')
    expect(clubTierForSpend(agorot(300_000)).id).toBe('gold')
    expect(clubTierForSpend(agorot(1_000_000)).id).toBe('platinum')
    expect(clubTierForSpend(agorot(50_000_000)).id).toBe('platinum')
  })
})

describe('club tiers: the twelve-month window', () => {
  it('starts 365 days before the read', () => {
    expect(clubWindowStart(now)).toBe('2025-09-25T12:00:00.000Z')
  })

  it('counts a paid order inside the window and drops one just outside it', () => {
    const inside = row({ paid_at: '2025-09-25T12:00:01Z' })
    const outside = row({ paid_at: '2025-09-25T11:59:59Z' })
    expect(sumClubSpend([inside, outside], now)).toBe(10_000)
  })

  it('uses paid_at, and falls back to created_at only when paid_at is null', () => {
    const paidLater = row({ created_at: '2025-01-01T00:00:00Z', paid_at: '2026-06-01T00:00:00Z' })
    const legacy = row({ created_at: '2026-06-01T00:00:00Z', paid_at: null })
    const legacyOld = row({ created_at: '2025-01-01T00:00:00Z', paid_at: null })
    expect(sumClubSpend([paidLater, legacy, legacyOld], now)).toBe(20_000)
  })

  it('ignores an order dated after the read', () => {
    expect(sumClubSpend([row({ paid_at: '2026-09-25T12:00:01Z' })], now)).toBe(0)
  })
})

describe('club tiers: which orders count', () => {
  it('counts every paid-and-kept status and nothing else', () => {
    expect([...CLUB_SPEND_STATUSES]).toEqual([
      'paid',
      'partially_fulfilled',
      'fulfilled',
      'platform_settled',
    ])
    const rows = [
      row({ status: 'pending' }),
      row({ status: 'cancelled' }),
      row({ status: 'refunded' }),
      row({ status: 'paid' }),
      row({ status: 'partially_fulfilled' }),
      row({ status: 'fulfilled' }),
      row({ status: 'platform_settled' }),
    ]
    expect(sumClubSpend(rows, now)).toBe(40_000)
  })

  it('skips a non-positive or non-integer total rather than summing it', () => {
    const rows = [
      row({ totalAgorot: agorot(0) }),
      row({ totalAgorot: 12.5 as never }),
      row({ totalAgorot: Number.NaN as never }),
      row({ totalAgorot: agorot(700) }),
    ]
    expect(sumClubSpend(rows, now)).toBe(700)
  })
})

describe('club tiers: standing', () => {
  it('reports the next tier, the gap and an integer half-up progress', () => {
    const standing = clubStanding(agorot(150_000), now)
    expect(standing.tier.id).toBe('silver')
    expect(standing.nextTier?.id).toBe('gold')
    expect(standing.remainingAgorot).toBe(150_000)
    // 50,000 into a 200,000 band = 25%.
    expect(standing.progressPercent).toBe(25)
    expect(Number.isInteger(standing.progressPercent)).toBe(true)
    expect(standing.windowStart).toBe('2025-09-25T12:00:00.000Z')
  })

  it('never shows 100% before the next tier is actually reached', () => {
    // 99,999 of 100,000 rounds half-up to 100; the bar must not say so.
    expect(clubStanding(agorot(99_999), now).progressPercent).toBe(99)
    expect(clubStanding(agorot(0), now).progressPercent).toBe(0)
  })

  it('at the top tier there is no next tier and the bar is full', () => {
    const standing = clubStanding(agorot(2_000_000), now)
    expect(standing.tier.id).toBe('platinum')
    expect(standing.nextTier).toBeNull()
    expect(standing.remainingAgorot).toBe(0)
    expect(standing.progressPercent).toBe(100)
  })
})

describe('club tiers: configurable thresholds (W07)', () => {
  const custom: readonly ClubTier[] = [
    { id: 'member', minAgorot: agorot(0) },
    { id: 'silver', minAgorot: agorot(50_000) },
    { id: 'gold', minAgorot: agorot(120_000) },
    { id: 'platinum', minAgorot: agorot(500_000) },
  ]

  it('the ids are fixed and the defaults carry exactly those ids in order', () => {
    expect(CLUB_TIERS.map((t) => t.id)).toEqual([...CLUB_TIER_IDS])
    expect(isClubTierId('gold')).toBe(true)
    expect(isClubTierId('diamond')).toBe(false)
    expect(isClubTierId(null)).toBe(false)
  })

  it('the step function and the standing follow the tiers they are handed', () => {
    expect(clubTierForSpend(agorot(119_999), custom).id).toBe('silver')
    expect(clubTierForSpend(agorot(120_000), custom).id).toBe('gold')
    // The same spend against the defaults is one tier lower.
    expect(clubTierForSpend(agorot(120_000)).id).toBe('silver')
    const standing = clubStanding(agorot(150_000), now, custom)
    expect(standing.tier.id).toBe('gold')
    expect(standing.nextTier?.id).toBe('platinum')
    expect(standing.remainingAgorot).toBe(350_000)
    // (150000 - 120000) * 100 / 380000 = 7.89 -> 8, half-up integer
    expect(standing.progressPercent).toBe(8)
  })

  it('tiersFromRows accepts the four known rows, in any order, with text amounts', () => {
    const parsed = tiersFromRows([
      { id: 'platinum', min_agorot: '500000' },
      { id: 'member', min_agorot: 0 },
      { id: 'gold', min_agorot: 120_000 },
      { id: 'silver', min_agorot: 50_000 },
    ])
    expect(parsed.ok).toBe(true)
    expect(parsed.tiers).toEqual(custom)
  })

  it.each([
    ['no rows', null],
    ['an empty table', []],
    ['a missing tier', [{ id: 'member', min_agorot: 0 }]],
    [
      'an unknown id',
      [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 1 },
        { id: 'gold', min_agorot: 2 },
        { id: 'platinum', min_agorot: 3 },
        { id: 'diamond', min_agorot: 4 },
      ],
    ],
    [
      'a floor above zero',
      [
        { id: 'member', min_agorot: 1 },
        { id: 'silver', min_agorot: 2 },
        { id: 'gold', min_agorot: 3 },
        { id: 'platinum', min_agorot: 4 },
      ],
    ],
    [
      'thresholds that are not strictly ascending',
      [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 200_000 },
        { id: 'gold', min_agorot: 100_000 },
        { id: 'platinum', min_agorot: 1_000_000 },
      ],
    ],
    [
      'an equal pair',
      [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 100_000 },
        { id: 'gold', min_agorot: 100_000 },
        { id: 'platinum', min_agorot: 1_000_000 },
      ],
    ],
    [
      'a float',
      [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 100_000.5 },
        { id: 'gold', min_agorot: 300_000 },
        { id: 'platinum', min_agorot: 1_000_000 },
      ],
    ],
    [
      'a duplicate id',
      [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 100_000 },
        { id: 'silver', min_agorot: 300_000 },
        { id: 'platinum', min_agorot: 1_000_000 },
      ],
    ],
  ])('tiersFromRows falls back to the defaults on %s, with a reason', (_label, rows) => {
    const parsed = tiersFromRows(rows as never)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason.length).toBeGreaterThan(0)
    expect(parsed.tiers).toBe(CLUB_TIERS)
  })
})
