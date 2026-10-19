import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { clubStanding, trailingSpend } from './tiers'

const now = new Date('2026-10-16T00:00:00Z')

describe('trailingSpend', () => {
  it('sums paid orders in the last 12 months only', () => {
    const spend = trailingSpend(
      [
        { totalAgorot: 10_000, paidAt: '2026-09-01T00:00:00Z', status: 'paid' },
        { totalAgorot: 5_000, paidAt: '2025-10-17T00:00:00Z', status: 'paid' },
        { totalAgorot: 99_999, paidAt: '2025-10-15T00:00:00Z', status: 'paid' },
        { totalAgorot: 7_000, paidAt: null, status: 'pending' },
        { totalAgorot: 8_000, paidAt: '2026-08-01T00:00:00Z', status: 'refunded' },
        { totalAgorot: 8_000, paidAt: '2026-08-01T00:00:00Z', status: 'cancelled' },
      ],
      now,
    )
    expect(spend).toBe(15_000)
  })
})

describe('clubStanding', () => {
  it('starts at the base tier and reports the gap to silver', () => {
    const s = clubStanding(agorot(40_000))
    expect(s.tier.key).toBe('basic')
    expect(s.next?.key).toBe('silver')
    expect(s.toNextAgorot).toBe(60_000)
  })
  it('promotes exactly on the threshold', () => {
    expect(clubStanding(agorot(100_000)).tier.key).toBe('silver')
    expect(clubStanding(agorot(99_999)).tier.key).toBe('basic')
  })
  it('has no next tier at the top', () => {
    const s = clubStanding(agorot(2_000_000))
    expect(s.tier.key).toBe('platinum')
    expect(s.next).toBeNull()
    expect(s.toNextAgorot).toBe(0)
  })
})
