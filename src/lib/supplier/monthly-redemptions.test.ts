import { describe, expect, it } from 'vitest'
import {
  MONTHLY_REDEMPTIONS_MONTHS,
  type SupplierRedemptionRow,
  monthlyRedemptions,
} from './dashboard'

function redemption(overrides: Partial<SupplierRedemptionRow> = {}): SupplierRedemptionRow {
  return {
    voucherId: crypto.randomUUID(),
    code: 'ABCDE12345',
    productName: 'ארוחה זוגית',
    customerName: null,
    remainingAmountDueAgorot: 14_000,
    couponPriceAgorot: 6_000,
    platformPercent: 30,
    redeemedAt: '2026-09-05T09:00:00Z',
    status: 'redeemed',
    ...overrides,
  }
}

const NOW = new Date('2026-09-10T12:00:00Z')

describe('monthly redemption buckets', () => {
  it('returns a contiguous window ending in the current month', () => {
    const buckets = monthlyRedemptions([], { now: NOW })
    expect(buckets).toHaveLength(MONTHLY_REDEMPTIONS_MONTHS)
    expect(buckets.at(-1)?.month).toBe('2026-09')
    expect(buckets[0]?.month).toBe('2025-10')
  })

  /**
   * The reason the buckets are built from the calendar and not from the rows.
   * Emitting only months that had a scan puts July directly beside September
   * and makes the month with no takings invisible -- which is the one a
   * supplier most needs to see.
   */
  it('emits a month with no redemptions at zero rather than omitting it', () => {
    const buckets = monthlyRedemptions(
      [
        redemption({ redeemedAt: '2026-07-15T09:00:00Z' }),
        redemption({ redeemedAt: '2026-09-05T09:00:00Z' }),
      ],
      { now: NOW },
    )
    const august = buckets.find((bucket) => bucket.month === '2026-08')
    expect(august).toBeDefined()
    expect(august?.count).toBe(0)
    // And it is still between the two months that do have scans.
    const months = buckets.map((bucket) => bucket.month)
    expect(months.indexOf('2026-07')).toBeLessThan(months.indexOf('2026-08'))
    expect(months.indexOf('2026-08')).toBeLessThan(months.indexOf('2026-09'))
  })

  it('counts scans and sums the till balance per month', () => {
    const buckets = monthlyRedemptions(
      [
        redemption({ redeemedAt: '2026-09-01T09:00:00Z', remainingAmountDueAgorot: 10_000 }),
        redemption({ redeemedAt: '2026-09-09T09:00:00Z', remainingAmountDueAgorot: 2_500 }),
        redemption({ redeemedAt: '2026-08-20T09:00:00Z', remainingAmountDueAgorot: 7_000 }),
      ],
      { now: NOW },
    )
    const september = buckets.find((b) => b.month === '2026-09')
    expect(september?.count).toBe(2)
    expect(september?.tillCollectedAgorot).toBe(12_500)
    expect(buckets.find((b) => b.month === '2026-08')?.tillCollectedAgorot).toBe(7_000)
  })

  /**
   * `redeemed_at` is stored UTC. 22:00 UTC on 31 August is 01:00 on 1 September
   * in Israel, which is the date on the till roll -- so it belongs to September.
   * Bucketing on the UTC month files it against a month the shop disagrees with.
   */
  it('buckets on the Israel calendar, not the UTC one', () => {
    const buckets = monthlyRedemptions([redemption({ redeemedAt: '2026-08-31T22:00:00Z' })], {
      now: NOW,
    })
    expect(buckets.find((b) => b.month === '2026-09')?.count).toBe(1)
    expect(buckets.find((b) => b.month === '2026-08')?.count).toBe(0)
  })

  it('ignores rows that are not redeemed, or carry no date, or carry a bad one', () => {
    const buckets = monthlyRedemptions(
      [
        redemption({ status: 'issued' }),
        redemption({ redeemedAt: null }),
        redemption({ redeemedAt: 'not-a-date' }),
      ],
      { now: NOW },
    )
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(0)
  })

  it('drops a redemption older than the window instead of folding it into the first month', () => {
    // Otherwise the leftmost column silently becomes "this month and everything
    // before it", which is not what its label says.
    const buckets = monthlyRedemptions([redemption({ redeemedAt: '2024-01-05T09:00:00Z' })], {
      now: NOW,
    })
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(0)
  })

  it('never returns a zero-length window', () => {
    expect(monthlyRedemptions([], { months: 0, now: NOW })).toHaveLength(1)
  })

  /**
   * A December window has to roll the year over. Stepping months on a local
   * Date is where that usually goes wrong.
   */
  it('crosses the year boundary', () => {
    const buckets = monthlyRedemptions([], { months: 3, now: new Date('2026-01-15T12:00:00Z') })
    expect(buckets.map((b) => b.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('labels every bucket', () => {
    for (const bucket of monthlyRedemptions([], { now: NOW })) {
      expect(bucket.label).toBeTruthy()
    }
  })
})
