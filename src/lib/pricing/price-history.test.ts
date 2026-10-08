import { describe, expect, it } from 'vitest'
import {
  ALL_TIME_LOW_MIN_DAYS,
  type PriceHistoryRow,
  chartGeometry,
  chartSeries,
  dailyLows,
  dayKeyOffset,
  priceSignal,
  shortDayLabel,
  summarizeHistory,
} from './price-history'

/**
 * The storefront's reading of `price_history` (STEP 59). Pinned: a day's
 * price is its LOWEST row (193's rule), non-sale days do not count, a drop is
 * measured against the previous observed day in integer agorot, an all-time
 * low needs seven sale days and the current price at or under every earlier
 * day, and the chart is a step line over calendar time.
 */

function row(observed_on: string, price_agorot: number, status = 'active'): PriceHistoryRow {
  return { observed_on, price_agorot, status }
}

describe('dailyLows', () => {
  it('takes the lowest sale price of each day, ascending, and drops what is not a sale', () => {
    const points = dailyLows([
      row('2026-10-03', 9900),
      row('2026-10-01', 12000),
      row('2026-10-03', 8900), // a second row the same day: the lower wins
      row('2026-10-02', 11000, 'draft'), // not on sale that day
      row('2026-10-04', 0), // a price of nothing is a data problem
      row('2026-10-05', 7000, 'sold_out'), // still a price a shopper saw
      row('bad-day', 5000),
    ])
    expect(points).toEqual([
      { day: '2026-10-01', agorot: 12000 },
      { day: '2026-10-03', agorot: 8900 },
      { day: '2026-10-05', agorot: 7000 },
    ])
  })
})

describe('summarizeHistory', () => {
  it('reports the previous day, the lowest earlier day and the day count, excluding today', () => {
    const rows = [
      row('2026-10-01', 12000),
      row('2026-10-02', 9000),
      row('2026-10-03', 10000),
      row('2026-10-04', 8000), // today, not part of "before"
    ]
    expect(summarizeHistory(rows, '2026-10-04')).toEqual({
      previousAgorot: 10000,
      lowestBeforeTodayAgorot: 9000,
      observedDays: 3,
    })
  })

  it('is empty on a first day', () => {
    expect(summarizeHistory([row('2026-10-04', 8000)], '2026-10-04')).toEqual({
      previousAgorot: null,
      lowestBeforeTodayAgorot: null,
      observedDays: 0,
    })
  })
})

describe('priceSignal', () => {
  const sevenDays = { previousAgorot: 10000, lowestBeforeTodayAgorot: 9000, observedDays: 7 }

  it('is null without a summary, without a usable price, or with nothing to say', () => {
    expect(priceSignal(null, 8000)).toBeNull()
    expect(priceSignal(sevenDays, null)).toBeNull()
    expect(priceSignal(sevenDays, 0)).toBeNull()
    expect(priceSignal(sevenDays, 99.5)).toBeNull()
    expect(priceSignal(sevenDays, 10000)).toBeNull() // held
    expect(priceSignal(sevenDays, 11000)).toBeNull() // rose
  })

  it('reports a drop against the previous day as a whole percent, half up', () => {
    expect(priceSignal(sevenDays, 9500)).toEqual({
      drop: { oldAgorot: 10000, newAgorot: 9500, percent: 5 },
      allTimeLow: false,
    })
    // 1/3 off: 33.33 -> 33
    expect(priceSignal({ ...sevenDays, previousAgorot: 30000 }, 20000)?.drop?.percent).toBe(33)
    // 2/3 off: 66.67 -> 67
    expect(priceSignal({ ...sevenDays, previousAgorot: 30000 }, 10000)?.drop?.percent).toBe(67)
  })

  it('does not call a sub-percent move a drop', () => {
    expect(priceSignal({ ...sevenDays, previousAgorot: 100000 }, 99950)).toBeNull()
  })

  it('claims an all-time low only at or under every earlier day, over enough days', () => {
    expect(priceSignal(sevenDays, 9000)).toEqual({
      drop: { oldAgorot: 10000, newAgorot: 9000, percent: 10 },
      allTimeLow: true,
    })
    expect(priceSignal(sevenDays, 8999)?.allTimeLow).toBe(true)
    expect(priceSignal(sevenDays, 9001)?.allTimeLow).toBe(false)
    expect(
      priceSignal({ ...sevenDays, observedDays: ALL_TIME_LOW_MIN_DAYS - 1 }, 8000)?.allTimeLow,
    ).toBe(false)
    expect(
      priceSignal({ ...sevenDays, observedDays: ALL_TIME_LOW_MIN_DAYS }, 8000)?.allTimeLow,
    ).toBe(true)
  })

  it('can be an all-time low without a drop: the price held at the floor', () => {
    expect(
      priceSignal({ previousAgorot: 9000, lowestBeforeTodayAgorot: 9000, observedDays: 9 }, 9000),
    ).toEqual({
      drop: null,
      allTimeLow: true,
    })
  })
})

describe('day keys', () => {
  it('moves a calendar day without a zone', () => {
    expect(dayKeyOffset('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayKeyOffset('2026-12-31', 1)).toBe('2027-01-01')
    expect(dayKeyOffset('2026-10-08', -89)).toBe('2026-07-11')
  })

  it('labels a day as DD.MM', () => {
    expect(shortDayLabel('2026-10-08')).toBe('08.10')
  })
})

describe('chartSeries', () => {
  it('keeps the window ending today, inclusive on both ends', () => {
    const points = [
      { day: '2026-07-10', agorot: 1 },
      { day: '2026-07-11', agorot: 2 },
      { day: '2026-10-08', agorot: 3 },
      { day: '2026-10-09', agorot: 4 },
    ]
    expect(chartSeries(points, '2026-10-08', 90).map((p) => p.day)).toEqual([
      '2026-07-11',
      '2026-10-08',
    ])
  })
})

describe('chartGeometry', () => {
  it('needs two points', () => {
    expect(chartGeometry([{ day: '2026-10-01', agorot: 100 }], 600, 120)).toBeNull()
  })

  it('draws a step line spaced by calendar days, lowest at the bottom', () => {
    const g = chartGeometry(
      [
        { day: '2026-10-01', agorot: 10000 },
        { day: '2026-10-03', agorot: 8000 }, // a two-day gap, 8000 is the floor
        { day: '2026-10-05', agorot: 12000 },
      ],
      600,
      120,
      0,
    )
    expect(g).not.toBeNull()
    if (!g) return
    expect(g.minAgorot).toBe(8000)
    expect(g.maxAgorot).toBe(12000)
    expect(g.firstDay).toBe('2026-10-01')
    expect(g.lastDay).toBe('2026-10-05')
    // x: day 1 -> 0, day 3 -> 300, day 5 -> 600. y: 12000 -> 0, 8000 -> 120, 10000 -> 60.
    // Each change of level adds the horizontal run first, so the line steps.
    expect(g.polyline).toBe('0,60 300,60 300,120 600,120 600,0')
    expect(g.last).toEqual({ x: 600, y: 0 })
  })

  it('puts a flat history mid-chart rather than dividing by zero', () => {
    const g = chartGeometry(
      [
        { day: '2026-10-01', agorot: 5000 },
        { day: '2026-10-02', agorot: 5000 },
      ],
      100,
      50,
      0,
    )
    expect(g?.polyline).toBe('0,50 100,50')
    expect(g?.minAgorot).toBe(5000)
    expect(g?.maxAgorot).toBe(5000)
  })
})
