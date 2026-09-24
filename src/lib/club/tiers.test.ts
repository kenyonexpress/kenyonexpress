import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  CLUB_SPEND_STATUSES,
  CLUB_TIERS,
  clubStanding,
  clubTierForSpend,
  clubWindowStart,
  sumClubSpend,
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
