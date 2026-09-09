import { describe, expect, it } from 'vitest'
import { endOfJerusalemDay, jerusalemOffsetMinutes, parseIsoDate } from './expiry-date'

/**
 * A deadline typed into an admin form has to survive two things: the runtime's
 * own zone (UTC on Vercel, Asia/Jerusalem on Ofir's machine) and Israel's clock
 * changes. These tests assert absolute instants, so they give the same answer
 * on both machines.
 */

describe('endOfJerusalemDay', () => {
  it('is the last second of the chosen day and not its midnight', () => {
    // 20 Aug 2026 is inside IDT (UTC+3), so 23:59:59 local is 20:59:59Z.
    // Not 31 October: IDT ends on the last Sunday of October, the 25th, so a
    // date chosen "obviously in summer" from the month name alone is already
    // back on UTC+2. That is precisely the mistake this function exists to stop
    // anyone making by hand.
    expect(endOfJerusalemDay('2026-08-20')?.toISOString()).toBe('2026-08-20T20:59:59.000Z')
  })

  it('uses the winter offset in winter', () => {
    // 15 Jan is IST (UTC+2): 23:59:59 local is 21:59:59Z.
    expect(endOfJerusalemDay('2026-01-15')?.toISOString()).toBe('2026-01-15T21:59:59.000Z')
  })

  /**
   * The case the single-pass version gets wrong. On the night the clocks go
   * back, the offset at midday is not the offset at 23:59, and guessing from
   * midday alone puts the deadline an hour out.
   */
  it('lands on the right instant across both clock changes', () => {
    for (const date of ['2026-03-27', '2026-03-28', '2026-10-24', '2026-10-25']) {
      const end = endOfJerusalemDay(date)
      expect(end, date).not.toBeNull()
      // Whatever the offset turned out to be, the instant must READ BACK as
      // 23:59:59 on that date in Jerusalem. That is the property, and it holds
      // without this test having to know which offset applied.
      const readBack = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(end as Date)
      expect(readBack, date).toContain(date)
      expect(readBack, date).toContain('23:59:59')
    }
  })

  it('is always later than the same day’s start', () => {
    const end = endOfJerusalemDay('2026-06-01') as Date
    expect(end.getTime()).toBeGreaterThan(Date.UTC(2026, 5, 1, 0, 0, 0))
  })

  it('refuses what is not a date', () => {
    expect(endOfJerusalemDay('')).toBeNull()
    expect(endOfJerusalemDay('banana')).toBeNull()
    expect(endOfJerusalemDay('31-10-2026')).toBeNull()
  })
})

describe('parseIsoDate', () => {
  /** A component-wise range check would roll this into 3 March. */
  it('refuses a day that does not exist rather than rolling it forward', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
  })

  it('accepts a real date', () => {
    expect(parseIsoDate('2026-02-28')).toEqual({ y: 2026, m: 2, d: 28 })
  })

  /** 2028 is a leap year; 2026 is not. */
  it('knows about leap years', () => {
    expect(parseIsoDate('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 })
    expect(parseIsoDate('2026-02-29')).toBeNull()
  })
})

describe('jerusalemOffsetMinutes', () => {
  it('reads +120 in winter and +180 in summer', () => {
    expect(jerusalemOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(120)
    expect(jerusalemOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(180)
  })
})
