import {
  buildReferralLeaderboard,
  israelMonthKey,
  israelMonthRange,
  monthLabel,
} from '@/lib/referrals/leaderboard'
import { describe, expect, it } from 'vitest'

const ME = 'me'

function row(referrerUserId: string, count: number) {
  return { referrerUserId, count }
}

describe('buildReferralLeaderboard', () => {
  it('ranks highest first', () => {
    const { entries } = buildReferralLeaderboard([row('a', 1), row('b', 5), row('c', 3)], null)
    expect(entries.map((e) => e.count)).toEqual([5, 3, 1])
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3])
  })

  it('shares a rank on a tie and skips the next one', () => {
    const { entries } = buildReferralLeaderboard(
      [row('a', 5), row('b', 3), row('c', 3), row('d', 1)],
      null,
    )
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 2, 4])
  })

  it('carries no field that could identify anyone', () => {
    const { entries } = buildReferralLeaderboard([row('a', 5)], null)
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(['count', 'isMe', 'rank'])
  })

  it('marks the reader own row', () => {
    const { entries } = buildReferralLeaderboard([row('a', 5), row(ME, 3)], ME)
    expect(entries.map((e) => e.isMe)).toEqual([false, true])
  })

  it('appends the reader own row when it falls outside the visible table', () => {
    const rows = [...Array(12)].map((_, i) => row(`u${i}`, 20 - i))
    rows.push(row(ME, 1))
    const { entries, viewerOutsideTop } = buildReferralLeaderboard(rows, ME, 10)
    expect(viewerOutsideTop).toBe(true)
    expect(entries).toHaveLength(11)
    // Its true rank, not a fake tenth place: the gap is the information.
    expect(entries[10]).toMatchObject({ isMe: true, count: 1, rank: 13 })
  })

  it('does not append when the reader is already in the table', () => {
    const { entries, viewerOutsideTop } = buildReferralLeaderboard(
      [row('a', 5), row(ME, 3)],
      ME,
      10,
    )
    expect(viewerOutsideTop).toBe(false)
    expect(entries).toHaveLength(2)
  })

  it('drops referrers with no completed referral rather than listing zeros', () => {
    const { entries } = buildReferralLeaderboard([row('a', 0), row('b', 2)], null)
    expect(entries).toHaveLength(1)
  })

  it('is empty for no rows', () => {
    expect(buildReferralLeaderboard([], ME)).toEqual({ entries: [], viewerOutsideTop: false })
  })
})

describe('israelMonthRange', () => {
  it('starts before the Israel month begins so the first evening is not lost', () => {
    // Israel is UTC+3 in September, so 2026-09-01 00:00 Israel is
    // 2026-08-31 21:00 UTC. A window starting at 2026-09-01T00:00Z would miss
    // three hours of real referrals on the 1st.
    const { from, to } = israelMonthRange(new Date('2026-09-15T12:00:00.000Z'))
    expect(new Date(from).getTime()).toBeLessThan(Date.parse('2026-08-31T21:00:00.000Z'))
    expect(to).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('israelMonthKey', () => {
  it('buckets by the Israel month, not the UTC one', () => {
    // 2026-08-31 22:00 UTC is already 2026-09-01 in Israel.
    expect(israelMonthKey('2026-08-31T22:00:00.000Z')).toBe('2026-09')
    expect(israelMonthKey('2026-08-31T18:00:00.000Z')).toBe('2026-08')
  })
})

describe('monthLabel', () => {
  it('formats in Hebrew', () => {
    expect(monthLabel('2026-09')).toContain('2026')
  })
})
