import { describe, expect, it } from 'vitest'
import {
  type ReportEvent,
  aggregate,
  fillDays,
  israelDay,
  israelMonth,
  summarise,
  supplierObligations,
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
