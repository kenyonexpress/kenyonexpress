import { describe, expect, it } from 'vitest'
import {
  type CohortOrder,
  buildRevenueCohorts,
  cohortTotals,
  israelMonthKey,
  monthOffset,
  repeatCustomerCount,
} from './cohorts'

function order(
  orderId: string,
  userId: string,
  paidAt: string,
  revenueAgorot: number,
): CohortOrder {
  return { orderId, userId, paidAt, revenueAgorot }
}

describe('israelMonthKey', () => {
  it('buckets by the Israel calendar, not UTC', () => {
    // 23:30 UTC on 31 July is 02:30 on 1 August in Jerusalem (UTC+3 in summer).
    expect(israelMonthKey('2026-07-31T23:30:00Z')).toBe('2026-08')
    expect(israelMonthKey('2026-07-31T20:00:00Z')).toBe('2026-07')
  })
})

describe('monthOffset', () => {
  it('counts whole months across a year boundary', () => {
    expect(monthOffset('2025-11', '2026-02')).toBe(3)
    expect(monthOffset('2026-02', '2026-02')).toBe(0)
    expect(monthOffset('2026-03', '2026-01')).toBe(-2)
  })
})

describe('buildRevenueCohorts', () => {
  const orders: CohortOrder[] = [
    order('o1', 'alice', '2026-06-05T10:00:00Z', 10_000),
    order('o2', 'bob', '2026-06-20T10:00:00Z', 20_000),
    order('o3', 'alice', '2026-07-02T10:00:00Z', 5_000),
    order('o4', 'alice', '2026-08-02T10:00:00Z', 7_000),
    order('o5', 'carol', '2026-07-15T10:00:00Z', 30_000),
    order('o6', 'bob', '2026-08-01T10:00:00Z', 1_000),
  ]

  it('assigns customers to their first paid month and builds the retention grid', () => {
    const rows = buildRevenueCohorts(orders, { throughMonth: '2026-08' })
    expect(rows.map((r) => r.cohort)).toEqual(['2026-06', '2026-07'])

    const june = rows[0]
    expect(june).toMatchObject({ customers: 2, orders: 5, revenueAgorot: 43_000 })
    expect(june?.cells.map((c) => c.offset)).toEqual([0, 1, 2])
    expect(june?.cells[0]).toMatchObject({
      activeCustomers: 2,
      retentionPct: 100,
      revenueAgorot: 30_000,
      cumulativeRevenueAgorot: 30_000,
      cumulativePerCustomerAgorot: 15_000,
    })
    expect(june?.cells[1]).toMatchObject({
      activeCustomers: 1,
      retentionPct: 50,
      revenueAgorot: 5_000,
    })
    expect(june?.cells[2]).toMatchObject({
      activeCustomers: 2,
      retentionPct: 100,
      revenueAgorot: 8_000,
      cumulativeRevenueAgorot: 43_000,
    })
    expect(june?.ltvAgorot).toBe(21_500)

    const july = rows[1]
    expect(july).toMatchObject({ customers: 1, orders: 1, revenueAgorot: 30_000 })
    // July only has offsets 0 and 1 through August; no phantom later cells.
    expect(july?.cells.map((c) => c.offset)).toEqual([0, 1])
    expect(july?.cells[1]).toMatchObject({ activeCustomers: 0, retentionPct: 0, revenueAgorot: 0 })
  })

  it('never shows a cell for a month that has not happened yet', () => {
    const rows = buildRevenueCohorts(orders, { throughMonth: '2026-06' })
    expect(rows[0]?.cells.map((c) => c.offset)).toEqual([0])
  })

  it('caps offsets at maxOffset', () => {
    const rows = buildRevenueCohorts(orders, { throughMonth: '2027-06', maxOffset: 1 })
    expect(rows[0]?.cells.map((c) => c.offset)).toEqual([0, 1])
  })

  it('deduplicates an order that arrives twice', () => {
    const rows = buildRevenueCohorts([orders[0]!, orders[0]!], { throughMonth: '2026-06' })
    expect(rows[0]).toMatchObject({ orders: 1, revenueAgorot: 10_000 })
  })

  it('rounds revenue per customer half up in integer agorot', () => {
    const rows = buildRevenueCohorts(
      [order('a', 'u1', '2026-06-01T10:00:00Z', 1), order('b', 'u2', '2026-06-01T10:00:00Z', 0)],
      { throughMonth: '2026-06' },
    )
    expect(rows[0]?.ltvAgorot).toBe(1)
    expect(Number.isInteger(rows[0]?.cells[0]?.cumulativePerCustomerAgorot)).toBe(true)
  })

  it('refuses a non-integer amount rather than carrying a float into money', () => {
    expect(() =>
      buildRevenueCohorts([order('x', 'u', '2026-06-01T10:00:00Z', 12.5)], {
        throughMonth: '2026-06',
      }),
    ).toThrow(TypeError)
  })

  it('returns an empty grid for no orders', () => {
    expect(buildRevenueCohorts([], { throughMonth: '2026-06' })).toEqual([])
  })

  it('totals and counts repeat customers exactly once each', () => {
    const rows = buildRevenueCohorts(orders, { throughMonth: '2026-08' })
    const totals = cohortTotals(rows, orders)
    expect(totals).toEqual({
      cohorts: 2,
      customers: 3,
      orders: 6,
      revenueAgorot: 73_000,
      // alice bought in July and August, bob in August: two repeaters, not three.
      repeatCustomers: 2,
      repeatRatePct: 66.7,
    })
    expect(repeatCustomerCount(orders)).toBe(2)
  })
})
