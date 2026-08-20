import { describe, expect, it } from 'vitest'
import {
  applyRealtimeRow,
  badgeText,
  bellLabel,
  belongsToFeed,
  formatRelativeHebrew,
  markRowsRead,
  sortNotifications,
  unreadCount,
} from './feed'
import type { NotificationAudience, NotificationRow } from './types'

const USER: NotificationAudience = { scope: 'user', userId: 'u1' }
const SHOP: NotificationAudience = { scope: 'supplier', supplierId: 's1' }

function row(overrides: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    user_id: 'u1',
    supplier_id: null,
    kind: 'order_paid',
    title_he: 'ההזמנה שלך התקבלה',
    body_he: null,
    href: null,
    data: {},
    read_at: null,
    created_at: '2026-08-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('sortNotifications', () => {
  it('puts the newest first', () => {
    const sorted = sortNotifications([
      row({ id: 'a', created_at: '2026-08-20T10:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-08-20T12:00:00.000Z' }),
    ])
    expect(sorted.map((entry) => entry.id)).toEqual(['b', 'a'])
  })

  it('breaks a tie by id so the order is stable across renders', () => {
    const same = '2026-08-20T10:00:00.000Z'
    const first = sortNotifications([
      row({ id: 'b', created_at: same }),
      row({ id: 'a', created_at: same }),
    ])
    const second = sortNotifications([
      row({ id: 'a', created_at: same }),
      row({ id: 'b', created_at: same }),
    ])
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id))
  })

  it('does not mutate its input', () => {
    const input = [row({ id: 'a' }), row({ id: 'b', created_at: '2026-08-21T10:00:00.000Z' })]
    sortNotifications(input)
    expect(input.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('belongsToFeed', () => {
  it('accepts only this user for a user feed', () => {
    expect(belongsToFeed(row({ id: 'a', user_id: 'u1' }), USER)).toBe(true)
    expect(belongsToFeed(row({ id: 'a', user_id: 'u2' }), USER)).toBe(false)
  })

  it('keeps a supplier member two feeds apart', () => {
    // The case the guard exists for: one person subscribed to both, and their
    // own coupon reminder must not surface in the shop's order feed.
    const personal = row({ id: 'a', user_id: 'u1', supplier_id: null })
    const shopRow = row({ id: 'b', user_id: null, supplier_id: 's1' })

    expect(belongsToFeed(personal, SHOP)).toBe(false)
    expect(belongsToFeed(shopRow, USER)).toBe(false)
    expect(belongsToFeed(shopRow, SHOP)).toBe(true)
  })
})

describe('applyRealtimeRow', () => {
  it('deduplicates the row that arrives in the fetch and again over the socket', () => {
    const existing = [row({ id: 'a' })]
    const next = applyRealtimeRow(existing, row({ id: 'a' }), USER, 20)
    expect(next).toHaveLength(1)
  })

  it('replaces a held row with the updated copy rather than appending it', () => {
    const existing = [row({ id: 'a', read_at: null })]
    const next = applyRealtimeRow(existing, row({ id: 'a', read_at: '2026-08-20T11:00:00.000Z' }), USER, 20)
    expect(next).toHaveLength(1)
    expect(next[0]?.read_at).toBe('2026-08-20T11:00:00.000Z')
  })

  it('treats an update for an unheld row as an insert', () => {
    const next = applyRealtimeRow([], row({ id: 'z', read_at: '2026-08-20T11:00:00.000Z' }), USER, 20)
    expect(next.map((entry) => entry.id)).toEqual(['z'])
  })

  it('drops a row addressed to somebody else', () => {
    const existing = [row({ id: 'a' })]
    const next = applyRealtimeRow(existing, row({ id: 'b', user_id: 'u2' }), USER, 20)
    expect(next.map((entry) => entry.id)).toEqual(['a'])
  })

  it('holds the list to the limit, newest kept', () => {
    const existing = [
      row({ id: 'a', created_at: '2026-08-20T09:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-08-20T08:00:00.000Z' }),
    ]
    const next = applyRealtimeRow(
      existing,
      row({ id: 'c', created_at: '2026-08-20T10:00:00.000Z' }),
      USER,
      2,
    )
    expect(next.map((entry) => entry.id)).toEqual(['c', 'a'])
  })
})

describe('markRowsRead and unreadCount', () => {
  it('marks everything when no ids are given', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    expect(unreadCount(rows)).toBe(2)
    expect(unreadCount(markRowsRead(rows, null, '2026-08-20T11:00:00.000Z'))).toBe(0)
  })

  it('marks only the named rows', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const marked = markRowsRead(rows, ['a'], '2026-08-20T11:00:00.000Z')
    expect(marked.find((entry) => entry.id === 'a')?.read_at).not.toBeNull()
    expect(marked.find((entry) => entry.id === 'b')?.read_at).toBeNull()
  })

  it('leaves an already-read row alone rather than restamping it', () => {
    const first = '2026-08-19T11:00:00.000Z'
    const rows = [row({ id: 'a', read_at: first })]
    expect(markRowsRead(rows, null, '2026-08-20T11:00:00.000Z')[0]?.read_at).toBe(first)
  })
})

describe('formatRelativeHebrew', () => {
  const base = Date.parse('2026-08-20T12:00:00.000Z')
  const ago = (ms: number) => new Date(base - ms).toISOString()

  it('reads the coarsest true unit', () => {
    expect(formatRelativeHebrew(ago(30_000), base)).toBe('עכשיו')
    expect(formatRelativeHebrew(ago(60_000), base)).toBe('לפני דקה')
    expect(formatRelativeHebrew(ago(5 * 60_000), base)).toBe('לפני 5 דקות')
    expect(formatRelativeHebrew(ago(60 * 60_000), base)).toBe('לפני שעה')
    expect(formatRelativeHebrew(ago(2 * 60 * 60_000), base)).toBe('לפני שעתיים')
    expect(formatRelativeHebrew(ago(5 * 60 * 60_000), base)).toBe('לפני 5 שעות')
    expect(formatRelativeHebrew(ago(24 * 60 * 60_000), base)).toBe('אתמול')
    expect(formatRelativeHebrew(ago(2 * 24 * 60 * 60_000), base)).toBe('לפני יומיים')
    expect(formatRelativeHebrew(ago(5 * 24 * 60 * 60_000), base)).toBe('לפני 5 ימים')
  })

  it('falls back to a date past a month', () => {
    expect(formatRelativeHebrew(ago(40 * 24 * 60 * 60_000), base)).toMatch(/2026/)
  })

  it('reads a clock-skewed future timestamp as now, not as a countdown', () => {
    expect(formatRelativeHebrew(new Date(base + 30_000).toISOString(), base)).toBe('עכשיו')
  })

  it('returns an empty string for an unparseable date instead of NaN', () => {
    expect(formatRelativeHebrew('not-a-date', base)).toBe('')
  })
})

describe('the badge and its label', () => {
  it('says nothing when there is nothing', () => {
    expect(badgeText(0)).toBe('')
    expect(bellLabel(0)).toBe('התראות')
  })

  it('caps at 99+ so the badge stays a circle', () => {
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('gives a screen reader the count in words', () => {
    expect(bellLabel(1)).toContain('הודעה אחת')
    expect(bellLabel(4)).toContain('4 הודעות')
  })
})
