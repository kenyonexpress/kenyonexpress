import { describe, expect, it } from 'vitest'
import {
  type SupplierExpiryCounts,
  byExpiryRateDesc,
  formatRateBp,
  supplierExpiryMetric,
  toSupplierExpiryCounts,
  totalExpiryMetric,
} from './expiry-metrics'

function counts(over: Partial<SupplierExpiryCounts> = {}): SupplierExpiryCounts {
  return {
    supplierId: 's1',
    supplierName: 'מספרת רון',
    issuedCount: 0,
    liveCount: 0,
    redeemedCount: 0,
    expiredCount: 0,
    expiredValueAgorot: 0,
    creditedValueAgorot: 0,
    ...over,
  }
}

describe('supplierExpiryMetric', () => {
  it('takes the rate over settled coupons, not over everything issued', () => {
    // 3 expired, 1 redeemed, 96 still live. Over issued this reads 3%; over
    // what has actually been decided it is 75%, which is the true picture.
    const metric = supplierExpiryMetric(
      counts({ issuedCount: 100, liveCount: 96, redeemedCount: 1, expiredCount: 3 }),
    )
    expect(metric.settledCount).toBe(4)
    expect(metric.rateBp).toBe(7_500)
  })

  /**
   * The direction that matters: a supplier who has just run a campaign must not
   * be flattered by a denominator full of coupons that could not have expired.
   */
  it('does not move when sales move', () => {
    const before = supplierExpiryMetric(counts({ redeemedCount: 1, expiredCount: 1 }))
    const after = supplierExpiryMetric(
      counts({ issuedCount: 500, liveCount: 498, redeemedCount: 1, expiredCount: 1 }),
    )
    expect(after.rateBp).toBe(before.rateBp)
  })

  it('is null and never zero when nothing has settled', () => {
    const metric = supplierExpiryMetric(counts({ issuedCount: 20, liveCount: 20 }))
    expect(metric.rateBp).toBeNull()
    expect(metric.settledCount).toBe(0)
  })

  it('reports the money owed and not yet moved', () => {
    const metric = supplierExpiryMetric(
      counts({ expiredCount: 2, expiredValueAgorot: 20_000, creditedValueAgorot: 10_800 }),
    )
    expect(metric.uncreditedAgorot).toBe(9_200)
  })

  /** Two sums read at different moments must not print a negative debt. */
  it('clamps a credited total that exceeds the expired total', () => {
    const metric = supplierExpiryMetric(
      counts({ expiredValueAgorot: 1_000, creditedValueAgorot: 5_000 }),
    )
    expect(metric.uncreditedAgorot).toBe(0)
  })

  it('rounds half up rather than truncating', () => {
    // 1 of 3 -> 33.333%. Truncation would give 3333; half-up gives 3333 too,
    // so use 2 of 3 -> 66.666% where the two differ.
    expect(supplierExpiryMetric(counts({ redeemedCount: 1, expiredCount: 2 })).rateBp).toBe(6_667)
  })
})

describe('byExpiryRateDesc', () => {
  it('puts the worst first and the unmeasured last', () => {
    const rows = [
      supplierExpiryMetric(counts({ supplierId: 'unmeasured', liveCount: 9 })),
      supplierExpiryMetric(counts({ supplierId: 'low', redeemedCount: 9, expiredCount: 1 })),
      supplierExpiryMetric(counts({ supplierId: 'high', redeemedCount: 1, expiredCount: 9 })),
    ]
    expect(rows.sort(byExpiryRateDesc).map((r) => r.supplierId)).toEqual([
      'high',
      'low',
      'unmeasured',
    ])
  })

  it('breaks a tied rate on how much money lapsed', () => {
    const small = supplierExpiryMetric(
      counts({ supplierId: 'small', redeemedCount: 1, expiredCount: 1, expiredValueAgorot: 900 }),
    )
    const big = supplierExpiryMetric(
      counts({ supplierId: 'big', redeemedCount: 1, expiredCount: 1, expiredValueAgorot: 69_900 }),
    )
    expect([small, big].sort(byExpiryRateDesc).map((r) => r.supplierId)).toEqual(['big', 'small'])
  })
})

describe('formatRateBp', () => {
  it('prints one decimal', () => {
    expect(formatRateBp(6_667)).toBe('66.7%')
    expect(formatRateBp(10_000)).toBe('100.0%')
    expect(formatRateBp(0)).toBe('0.0%')
  })

  it('prints a dash for an unmeasured supplier', () => {
    expect(formatRateBp(null)).toBe('—')
  })
})

describe('totalExpiryMetric', () => {
  /**
   * The platform's rate is a fact about coupons, not about suppliers. A mean of
   * the per-supplier rates would let a business with four settled coupons weigh
   * as much as one with four hundred.
   */
  it('weighs by coupons and not by suppliers', () => {
    const total = totalExpiryMetric([
      counts({ supplierId: 'tiny', redeemedCount: 0, expiredCount: 4 }),
      counts({ supplierId: 'huge', redeemedCount: 396, expiredCount: 4 }),
    ])
    // 8 expired of 404 settled = 1.98%. The mean of 100% and 1% would be 50.5%.
    expect(total.rateBp).toBe(198)
  })

  it('is null when the whole platform has settled nothing', () => {
    expect(totalExpiryMetric([counts({ liveCount: 5 })]).rateBp).toBeNull()
  })
})

describe('toSupplierExpiryCounts', () => {
  /** PostgREST returns bigint columns as strings, not numbers. */
  it('reads bigint columns that arrive as strings', () => {
    const row = toSupplierExpiryCounts({
      supplier_id: 's1',
      supplier_name: 'מספרת רון',
      issued_count: '10',
      live_count: '4',
      redeemed_count: '5',
      expired_count: '1',
      expired_value_agorot: '10800',
      credited_value_agorot: '0',
    })
    expect(row.expiredValueAgorot).toBe(10_800)
    expect(row.redeemedCount).toBe(5)
  })

  it('reads an unnamed supplier as null rather than as an empty label', () => {
    expect(toSupplierExpiryCounts({ supplier_id: 's1', supplier_name: '   ' }).supplierName).toBe(
      null,
    )
  })
})
