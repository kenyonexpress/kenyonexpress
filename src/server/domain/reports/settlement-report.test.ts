import { describe, expect, it } from 'vitest'
import {
  type ReportEvent,
  aggregate,
  fillDays,
  israelDay,
  israelDayRangeUtc,
  israelMidnightUtc,
  israelMonth,
  resolveReportRange,
  summarise,
  supplierObligations,
  todayInIsrael,
} from './settlement-report'

function event(overrides: Partial<ReportEvent> = {}): ReportEvent {
  return {
    kind: 'charge_settled',
    occurredAt: '2026-08-06T09:00:00Z',
    supplierId: 'sup-1',
    supplierName: 'מסעדת הים',
    paidOnSiteAgorot: 10_000,
    commissionAgorot: 3_000,
    supplierDueAgorot: 7_000,
    discountAgorot: 0,
    ...overrides,
  }
}

describe('the calendar, which is Israel and not UTC', () => {
  it('puts a sale just after Israeli midnight on the right day', () => {
    // 2026-08-05T21:30Z is 00:30 on the 6th in Israel. A UTC bucket would file
    // three hours of every month's revenue under the previous month.
    expect(israelDay('2026-08-05T21:30:00Z')).toBe('2026-08-06')
    expect(israelMonth('2026-08-05T21:30:00Z')).toBe('2026-08')
  })

  it('is null for an unparseable timestamp rather than the epoch', () => {
    expect(israelDay('not a date')).toBeNull()
  })
})

describe('aggregate', () => {
  it('sums a settled charge into gross, commission and supplier due', () => {
    const [day] = aggregate([event(), event()], 'day')
    expect(day).toMatchObject({
      period: '2026-08-06',
      grossAgorot: 20_000,
      commissionAgorot: 6_000,
      supplierDueAgorot: 14_000,
      orders: 2,
    })
  })

  it('counts a refund WITHOUT netting it off gross', () => {
    // A report that netted them would show a day with one sale and one refund
    // as a day with no activity — which is exactly the day somebody is looking
    // for. The refund amount is positive in `paid_on_site_agorot` because 094's
    // CHECK refuses negatives; the direction is the kind.
    const [day] = aggregate(
      [event(), event({ kind: 'refund_issued', paidOnSiteAgorot: 9_500 })],
      'day',
    )
    expect(day?.grossAgorot).toBe(10_000)
    expect(day?.refundedAgorot).toBe(9_500)
    expect(day?.orders).toBe(1)
  })

  it('does not count a refund as an order', () => {
    const [day] = aggregate([event({ kind: 'refund_issued' })], 'day')
    expect(day?.orders).toBe(0)
  })

  it('tracks platform-funded discounts separately from commission', () => {
    const [day] = aggregate(
      [event({ kind: 'discount_funded', discountAgorot: 500, paidOnSiteAgorot: 0 })],
      'day',
    )
    expect(day?.discountAgorot).toBe(500)
    expect(day?.commissionAgorot).toBe(0)
  })

  it('ignores kinds that are not money movements on this report', () => {
    const [day] = aggregate([event(), event({ kind: 'voucher_expired' })], 'day')
    expect(day?.grossAgorot).toBe(10_000)
    expect(day?.orders).toBe(1)
  })

  it('buckets by month when asked, and sorts chronologically', () => {
    const months = aggregate(
      [
        event({ occurredAt: '2026-09-01T09:00:00Z' }),
        event({ occurredAt: '2026-07-15T09:00:00Z' }),
        event({ occurredAt: '2026-08-06T09:00:00Z' }),
      ],
      'month',
    )
    expect(months.map((m) => m.period)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('skips an unparseable timestamp rather than charting it at 1970', () => {
    expect(aggregate([event({ occurredAt: 'nonsense' })], 'day')).toEqual([])
  })

  it('returns nothing for nothing', () => {
    // The state production is in today: settlement_events has zero rows.
    expect(aggregate([], 'day')).toEqual([])
  })
})

describe('supplierObligations', () => {
  it('adds what a settled charge released to the supplier', () => {
    const [row] = supplierObligations([event(), event()])
    expect(row).toMatchObject({ earnedAgorot: 14_000, openAgorot: 14_000 })
  })

  it('subtracts a claw-back from a refunded line', () => {
    const rows = supplierObligations([
      event(),
      event({ kind: 'supplier_debit', supplierDueAgorot: 7_000 }),
    ])
    expect(rows[0]).toMatchObject({ earnedAgorot: 7_000, debitedAgorot: 7_000, openAgorot: 0 })
  })

  it('subtracts what has already been paid out', () => {
    const rows = supplierObligations([
      event(),
      event({ kind: 'payout_settled', supplierDueAgorot: 5_000 }),
    ])
    expect(rows[0]).toMatchObject({ settledAgorot: 5_000, openAgorot: 2_000 })
  })

  it('lets the open figure go NEGATIVE rather than clamping it at zero', () => {
    // A supplier refunded after being paid out genuinely owes money back, and a
    // report floored at zero hides exactly the case this screen is opened for.
    const rows = supplierObligations([
      event({ kind: 'payout_settled', supplierDueAgorot: 7_000 }),
      event({ kind: 'supplier_debit', supplierDueAgorot: 3_000 }),
    ])
    expect(rows[0]?.openAgorot).toBe(-10_000)
  })

  it('separates suppliers and sorts by what is owed, most first', () => {
    const rows = supplierObligations([
      event({ supplierId: 'a', supplierName: 'א', supplierDueAgorot: 100 }),
      event({ supplierId: 'b', supplierName: 'ב', supplierDueAgorot: 900 }),
    ])
    expect(rows.map((r) => r.supplierId)).toEqual(['b', 'a'])
  })

  it('picks up a name that only a later event carried', () => {
    const rows = supplierObligations([
      event({ supplierName: null }),
      event({ supplierName: 'מסעדת הים' }),
    ])
    expect(rows[0]?.supplierName).toBe('מסעדת הים')
  })

  it('ignores an event with no supplier on it', () => {
    // An order-level `refund_issued` has none.
    expect(supplierObligations([event({ supplierId: null })])).toEqual([])
  })
})

describe('summarise', () => {
  it('sums the same buckets the table shows', () => {
    const periods = aggregate([event(), event({ occurredAt: '2026-08-07T09:00:00Z' })], 'day')
    expect(summarise(periods)).toMatchObject({ grossAgorot: 20_000, orders: 2 })
  })

  it('is all zeroes for an empty report rather than NaN', () => {
    expect(summarise([])).toMatchObject({ grossAgorot: 0, orders: 0 })
  })
})

describe('fillDays', () => {
  it('inserts the days with no events at zero', () => {
    // A chart drawn straight from `aggregate` joins the 3rd to the 6th with a
    // straight line, which reads as three days of declining sales rather than
    // as three days of none.
    const filled = fillDays(aggregate([event()], 'day'), '2026-08-04', '2026-08-07')
    expect(filled.map((d) => d.period)).toEqual([
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ])
    expect(filled[0]?.grossAgorot).toBe(0)
    expect(filled[2]?.grossAgorot).toBe(10_000)
  })

  it('caps the range rather than rendering a decade into a chart', () => {
    expect(fillDays([], '2020-01-01', '2030-01-01').length).toBe(366)
  })

  it('returns the input untouched when the range is unparseable', () => {
    const periods = aggregate([event()], 'day')
    expect(fillDays(periods, 'nonsense', '2026-08-07')).toEqual(periods)
  })
})

describe('israelDayRangeUtc, the window the query actually asks for', () => {
  it('starts three hours before UTC midnight in summer', () => {
    // Israel is UTC+3 in August. A range that started at 2026-08-01T00:00:00Z
    // would drop every sale made between midnight and 03:00 local on the 1st:
    // the rows are never fetched, the report renders, and the missing money
    // reads as a quiet morning.
    const { startUtc } = israelDayRangeUtc('2026-08-01', '2026-08-31')
    expect(startUtc).toBe('2026-07-31T21:00:00.000Z')
  })

  it('is two hours in winter, because the offset is derived and not assumed', () => {
    expect(israelMidnightUtc('2026-01-15').toISOString()).toBe('2026-01-14T22:00:00.000Z')
  })

  it('ends at the start of the day AFTER `to`, half-open', () => {
    const { endUtc } = israelDayRangeUtc('2026-08-01', '2026-08-31')
    // Start of 1 September in Israel, not the end of 31 August: an inclusive
    // bound would pull in a sale landing exactly on local midnight.
    expect(endUtc).toBe('2026-08-31T21:00:00.000Z')
  })

  it('round-trips: the first instant of the range buckets to `from`', () => {
    for (const day of ['2026-01-15', '2026-03-27', '2026-08-01', '2026-10-25']) {
      const { startUtc } = israelDayRangeUtc(day, day)
      expect(israelDay(startUtc)).toBe(day)
      // And one millisecond earlier belongs to the day before, which is what
      // makes the bound exact rather than merely close.
      expect(israelDay(new Date(new Date(startUtc).getTime() - 1).toISOString())).not.toBe(day)
    }
  })

  it('crosses the DST switch without losing or duplicating an hour', () => {
    // Israel moves the clock forward on the last Friday of March. The offset at
    // UTC midnight is the pre-switch one, so a single-pass conversion places
    // local midnight an hour off on exactly this day.
    const { startUtc } = israelDayRangeUtc('2026-03-28', '2026-03-28')
    expect(israelDay(startUtc)).toBe('2026-03-28')
  })
})

describe('resolveReportRange, which the page and the CSV both go through', () => {
  const today = '2026-08-06'

  it('defaults to the last 30 days ending today', () => {
    expect(resolveReportRange({}, today)).toEqual({
      from: '2026-07-08',
      to: '2026-08-06',
      granularity: 'day',
    })
  })

  it('takes a range the admin typed', () => {
    expect(resolveReportRange({ from: '2026-01-01', to: '2026-01-31' }, today)).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
    })
  })

  it('swaps a backwards range instead of fetching nothing', () => {
    expect(resolveReportRange({ from: '2026-01-31', to: '2026-01-01' }, today)).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
    })
  })

  it('rejects a date that is only shaped like one', () => {
    // 2026-02-31 survives the regex and parses to 3 March in Date, which would
    // silently move the boundary three days.
    expect(resolveReportRange({ from: '2026-02-31' }, today).from).toBe('2026-07-08')
    expect(resolveReportRange({ to: 'yesterday' }, today).to).toBe(today)
  })

  it('clamps a decade from the RECENT end', () => {
    // An admin who typed a decade wants this year, not the year the catalogue
    // opened, and the cap matches the one fillDays renders at.
    const range = resolveReportRange({ from: '2016-01-01', to: '2026-08-06' }, today)
    expect(range.from).toBe('2025-08-06')
  })

  it('takes month granularity only when it is asked for by name', () => {
    expect(resolveReportRange({ granularity: 'month' }, today).granularity).toBe('month')
    expect(resolveReportRange({ granularity: 'quarter' }, today).granularity).toBe('day')
  })
})

describe('todayInIsrael', () => {
  it('is the Israeli date, not the UTC one, just after local midnight', () => {
    expect(todayInIsrael(new Date('2026-08-05T21:30:00Z'))).toBe('2026-08-06')
  })
})
