import {
  isIsraeliWeekend,
  nightKind,
  nightPrice,
  nightsBetween,
  quoteStay,
  withinFreeCancellation,
} from '@/lib/cabins/nights'
import { describe, expect, it } from 'vitest'

describe('nightsBetween', () => {
  it('is half-open: check-out is not a night', () => {
    // The whole reason a guest arriving on the 5th does not collide with one
    // leaving that morning. 1st to 5th is four nights.
    expect(nightsBetween('2026-10-01', '2026-10-05')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('crosses a month and a year boundary', () => {
    expect(nightsBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ])
  })

  it('returns nothing for an empty or backwards range rather than throwing', () => {
    expect(nightsBetween('2026-10-05', '2026-10-05')).toEqual([])
    expect(nightsBetween('2026-10-05', '2026-10-01')).toEqual([])
    expect(nightsBetween('rubbish', '2026-10-05')).toEqual([])
  })
})

describe('isIsraeliWeekend', () => {
  it('is Friday and Saturday', () => {
    // 2026-10-02 is a Friday, 2026-10-03 a Saturday, 2026-10-04 a Sunday.
    expect(isIsraeliWeekend('2026-10-02')).toBe(true)
    expect(isIsraeliWeekend('2026-10-03')).toBe(true)
    expect(isIsraeliWeekend('2026-10-04')).toBe(false)
    expect(isIsraeliWeekend('2026-10-01')).toBe(false)
  })

  it('does not shift with the local time zone', () => {
    // `new Date('2026-10-02')` is UTC midnight; in a zone behind UTC that is the
    // evening of the 1st, and `getDay()` would call this Friday a Thursday. The
    // arithmetic goes through Date.UTC for exactly this.
    const original = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(isIsraeliWeekend('2026-10-02')).toBe(true)
      process.env.TZ = 'Asia/Jerusalem'
      expect(isIsraeliWeekend('2026-10-02')).toBe(true)
    } finally {
      process.env.TZ = original
    }
  })
})

describe('nightKind', () => {
  it('lets a holiday beat a weekend', () => {
    // Most Jewish holidays fall on a Friday at least once. Pricing one as an
    // ordinary weekend is the mistake this ordering prevents.
    const holidays = new Set(['2026-10-02'])
    expect(nightKind('2026-10-02', holidays)).toBe('holiday')
    expect(nightKind('2026-10-03', holidays)).toBe('weekend')
    expect(nightKind('2026-10-04', holidays)).toBe('weekday')
  })
})

describe('nightPrice', () => {
  const rates = {
    baseAgorot: 50_000,
    weekendAgorot: 70_000,
    holidayAgorot: 90_000,
    ranges: [{ from: '2026-08-01', to: '2026-08-31', priceAgorot: 120_000 }],
  }

  it('prefers a dated range over everything, including a holiday', () => {
    // A season price is the operator saying "in this window, this is the price".
    // The most specific statement wins, which is the only ordering that lets an
    // operator override anything.
    expect(nightPrice('2026-08-15', 'holiday', rates)).toEqual({
      priceAgorot: 120_000,
      source: 'range',
    })
  })

  it('falls back to base when a weekend or holiday price is not set', () => {
    const bare = { baseAgorot: 50_000 }
    expect(nightPrice('2026-10-02', 'weekend', bare).priceAgorot).toBe(50_000)
    expect(nightPrice('2026-10-02', 'holiday', bare).priceAgorot).toBe(50_000)
  })

  it('treats the range as half-open, so two seasons do not fight over a day', () => {
    expect(nightPrice('2026-08-31', 'weekday', rates).source).toBe('base')
    expect(nightPrice('2026-08-30', 'weekday', rates).source).toBe('range')
  })
})

describe('quoteStay', () => {
  it('prices each night by its own kind and sums integers', () => {
    const quote = quoteStay(
      '2026-10-01',
      '2026-10-05',
      { baseAgorot: 50_000, weekendAgorot: 70_000, holidayAgorot: 90_000 },
      new Set(['2026-10-03']),
    )
    // Thu base, Fri weekend, Sat holiday, Sun base.
    expect(quote.nights.map((n) => n.source)).toEqual(['base', 'weekend', 'holiday', 'base'])
    expect(quote.totalAgorot).toBe(50_000 + 70_000 + 90_000 + 50_000)
  })

  it('quotes an impossible stay as zero nights and zero money', () => {
    const quote = quoteStay('2026-10-05', '2026-10-05', { baseAgorot: 50_000 })
    expect(quote.nights).toEqual([])
    expect(quote.totalAgorot).toBe(0)
  })
})

describe('withinFreeCancellation', () => {
  it('includes the boundary day', () => {
    // A rule a customer reads as "up to 14 days before" has to include the
    // fourteenth.
    expect(withinFreeCancellation('2026-10-01', '2026-10-15', 14)).toBe(true)
    expect(withinFreeCancellation('2026-10-02', '2026-10-15', 14)).toBe(false)
  })

  it('is false once check-in has passed', () => {
    expect(withinFreeCancellation('2026-10-20', '2026-10-15', 14)).toBe(false)
  })

  it('refuses junk rather than guessing', () => {
    expect(withinFreeCancellation('nope', '2026-10-15', 14)).toBe(false)
  })
})
