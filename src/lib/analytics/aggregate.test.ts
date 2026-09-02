import {
  type FunnelRow,
  type SaleLine,
  bucketSales,
  funnelWithRates,
  israelDayKey,
  periodKey,
  splitByProductType,
  takeRateByPlatformPercent,
  topProducts,
  topSuppliers,
  totalsOf,
} from '@/lib/analytics/aggregate'
import { describe, expect, it } from 'vitest'

function line(overrides: Partial<SaleLine> = {}): SaleLine {
  return {
    paidAt: '2026-03-10T09:00:00.000Z',
    orderId: 'order-1',
    productId: 'product-1',
    productName: 'מוצר',
    supplierId: 'supplier-1',
    supplierName: 'ספק',
    productType: 'physical',
    platformPercent: 10,
    gmvIls: 100,
    chargedOnSiteIls: 100,
    platformFeeIls: 10,
    supplierDueIls: 90,
    ...overrides,
  }
}

describe('israelDayKey', () => {
  it('keeps a midday UTC timestamp on the same calendar day', () => {
    expect(israelDayKey('2026-03-10T09:00:00.000Z')).toBe('2026-03-10')
  })

  it('pushes a late-evening UTC timestamp into the next Israeli day', () => {
    // 22:30 UTC in winter is 00:30 the next day in Israel. Cutting the UTC date
    // would file this sale under the wrong business day.
    expect(israelDayKey('2026-01-10T22:30:00.000Z')).toBe('2026-01-11')
  })

  it('handles the summer offset too', () => {
    // 21:30 UTC in July is 00:30 next day (UTC+3).
    expect(israelDayKey('2026-07-10T21:30:00.000Z')).toBe('2026-07-11')
  })
})

describe('periodKey', () => {
  it('buckets months to the first of the month', () => {
    expect(periodKey('2026-03-17T09:00:00.000Z', 'month')).toBe('2026-03-01')
  })

  it('starts weeks on Sunday', () => {
    // 2026-03-10 is a Tuesday; the Israeli business week began Sunday the 8th.
    expect(periodKey('2026-03-10T09:00:00.000Z', 'week')).toBe('2026-03-08')
  })

  it('leaves a Sunday as its own week start', () => {
    expect(periodKey('2026-03-08T09:00:00.000Z', 'week')).toBe('2026-03-08')
  })

  it('keeps a Saturday in the week that started six days earlier', () => {
    expect(periodKey('2026-03-14T09:00:00.000Z', 'week')).toBe('2026-03-08')
  })

  it('rolls the week over on the following Sunday', () => {
    expect(periodKey('2026-03-15T09:00:00.000Z', 'week')).toBe('2026-03-15')
  })

  it('uses the Israeli day, not the UTC day, when picking the week', () => {
    // 2026-03-14T22:30Z is Sunday 2026-03-15 in Israel, so it belongs to the
    // week starting that Sunday, not the previous one.
    expect(periodKey('2026-03-14T22:30:00.000Z', 'week')).toBe('2026-03-15')
  })
})

describe('bucketSales', () => {
  it('counts orders distinctly across their item lines', () => {
    const [bucket] = bucketSales(
      [
        line({ orderId: 'a', gmvIls: 100, platformFeeIls: 10 }),
        line({ orderId: 'a', gmvIls: 50, platformFeeIls: 5, productId: 'product-2' }),
        line({ orderId: 'b', gmvIls: 30, platformFeeIls: 3 }),
      ],
      'day',
    )

    expect(bucket?.orders).toBe(2)
    expect(bucket?.items).toBe(3)
    expect(bucket?.gmvIls).toBe(180)
    expect(bucket?.platformRevenueIls).toBe(18)
  })

  it('divides AOV by orders, not by item lines', () => {
    const [bucket] = bucketSales(
      [line({ orderId: 'a', gmvIls: 100 }), line({ orderId: 'a', gmvIls: 50 })],
      'day',
    )

    expect(bucket?.aovIls).toBe(150)
  })

  it('returns buckets in chronological order', () => {
    const buckets = bucketSales(
      [
        line({ paidAt: '2026-03-12T09:00:00.000Z', orderId: 'c' }),
        line({ paidAt: '2026-03-10T09:00:00.000Z', orderId: 'a' }),
        line({ paidAt: '2026-03-11T09:00:00.000Z', orderId: 'b' }),
      ],
      'day',
    )

    expect(buckets.map((b) => b.key)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12'])
  })

  it('groups a whole Israeli week into one bucket', () => {
    const buckets = bucketSales(
      [
        line({ paidAt: '2026-03-08T09:00:00.000Z', orderId: 'a' }),
        line({ paidAt: '2026-03-14T09:00:00.000Z', orderId: 'b' }),
        line({ paidAt: '2026-03-15T09:00:00.000Z', orderId: 'c' }),
      ],
      'week',
    )

    expect(buckets.map((b) => [b.key, b.orders])).toEqual([
      ['2026-03-08', 2],
      ['2026-03-15', 1],
    ])
  })

  it('rounds accumulated money once, at the end', () => {
    const [bucket] = bucketSales(
      [
        line({ orderId: 'a', gmvIls: 0.1, platformFeeIls: 0 }),
        line({ orderId: 'b', gmvIls: 0.2, platformFeeIls: 0 }),
      ],
      'day',
    )

    expect(bucket?.gmvIls).toBe(0.3)
  })

  it('returns nothing for no sales', () => {
    expect(bucketSales([], 'day')).toEqual([])
  })
})

describe('topProducts', () => {
  it('ranks by GMV and respects the limit', () => {
    const rows = topProducts(
      [
        line({ productId: 'p1', productName: 'א', gmvIls: 100 }),
        line({ productId: 'p2', productName: 'ב', gmvIls: 300 }),
        line({ productId: 'p3', productName: 'ג', gmvIls: 200 }),
      ],
      2,
    )

    expect(rows.map((r) => r.productId)).toEqual(['p2', 'p3'])
  })

  it('sums units and revenue per product across orders', () => {
    const [row] = topProducts([
      line({ productId: 'p1', orderId: 'a', gmvIls: 100, platformFeeIls: 10 }),
      line({ productId: 'p1', orderId: 'b', gmvIls: 100, platformFeeIls: 10 }),
    ])

    expect(row?.units).toBe(2)
    expect(row?.gmvIls).toBe(200)
    expect(row?.platformRevenueIls).toBe(20)
  })

  it('labels a product that no longer exists instead of dropping its sales', () => {
    const [row] = topProducts([line({ productId: null, productName: null })])

    expect(row?.productName).toBe('מוצר שנמחק')
    expect(row?.gmvIls).toBe(100)
  })
})

describe('splitByProductType', () => {
  it('splits GMV share between coupon and physical', () => {
    const rows = splitByProductType([
      line({ orderId: 'a', productType: 'coupon', gmvIls: 300, chargedOnSiteIls: 100 }),
      line({ orderId: 'b', productType: 'physical', gmvIls: 100, chargedOnSiteIls: 100 }),
    ])

    expect(rows.map((r) => [r.productType, r.gmvSharePct])).toEqual([
      ['coupon', 75],
      ['physical', 25],
    ])
  })

  it('keeps face value and cash collected on site apart for coupons', () => {
    const [coupon] = splitByProductType([
      line({ productType: 'coupon', gmvIls: 300, chargedOnSiteIls: 100 }),
    ])

    expect(coupon?.gmvIls).toBe(300)
    expect(coupon?.chargedOnSiteIls).toBe(100)
  })

  it('does not divide by zero when there is no GMV', () => {
    const [row] = splitByProductType([line({ gmvIls: 0, chargedOnSiteIls: 0 })])

    expect(row?.gmvSharePct).toBe(0)
  })
})

describe('takeRateByPlatformPercent', () => {
  it('groups by the snapshotted percent, not by a current product setting', () => {
    const rows = takeRateByPlatformPercent([
      line({ orderId: 'a', platformPercent: 10, gmvIls: 100, platformFeeIls: 10 }),
      line({ orderId: 'b', platformPercent: 15, gmvIls: 100, platformFeeIls: 15 }),
      line({ orderId: 'c', platformPercent: 10, gmvIls: 100, platformFeeIls: 10 }),
    ])

    expect(rows.map((r) => [r.platformPercent, r.items, r.platformRevenueIls])).toEqual([
      [15, 1, 15],
      [10, 2, 20],
    ])
  })

  it('reports an effective take rate below the nominal percent for coupons', () => {
    // Face value 300, charged on site 100, fee 10. Nominal 10% of the on-site
    // charge, but 3.33% of GMV: that gap is exactly what this table shows.
    const [row] = takeRateByPlatformPercent([
      line({ productType: 'coupon', platformPercent: 10, gmvIls: 300, platformFeeIls: 10 }),
    ])

    expect(row?.effectiveTakeRatePct).toBe(3.33)
  })

  it('reports no take rate rather than zero when there is no GMV', () => {
    const [row] = takeRateByPlatformPercent([line({ gmvIls: 0, platformFeeIls: 0 })])

    expect(row?.effectiveTakeRatePct).toBeNull()
  })

  it('keeps items with no snapshotted percent visible', () => {
    const rows = takeRateByPlatformPercent([line({ platformPercent: null })])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.platformPercent).toBeNull()
  })
})

describe('funnelWithRates', () => {
  const row: FunnelRow = {
    sessions: 1000,
    productViews: 500,
    addToCarts: 200,
    checkoutSteps: 100,
    checkouts: 50,
    purchases: 25,
  }

  it('computes step-to-step conversion', () => {
    const steps = funnelWithRates(row)

    expect(steps.map((s) => s.fromPreviousPct)).toEqual([null, 50, 40, 50, 50, 50])
  })

  it('computes conversion from the top of the funnel', () => {
    const steps = funnelWithRates(row)

    expect(steps.at(-1)?.fromTopPct).toBe(2.5)
  })

  it('reports null, not zero, when the previous step had no traffic', () => {
    const steps = funnelWithRates({
      sessions: 0,
      productViews: 0,
      addToCarts: 0,
      checkoutSteps: 0,
      checkouts: 0,
      purchases: 0,
    })

    expect(steps.every((s) => s.fromPreviousPct === null)).toBe(true)
    expect(steps.every((s) => s.fromTopPct === null)).toBe(true)
  })

  it('keeps checkout_step between add_to_cart and begin_checkout', () => {
    expect(funnelWithRates(row).map((s) => s.key)).toEqual([
      'sessions',
      'productViews',
      'addToCarts',
      'checkoutSteps',
      'checkouts',
      'purchases',
    ])
  })
})

describe('totalsOf', () => {
  it('sums the series and recomputes AOV over the whole period', () => {
    const buckets = bucketSales(
      [
        line({ paidAt: '2026-03-10T09:00:00.000Z', orderId: 'a', gmvIls: 100 }),
        line({ paidAt: '2026-03-11T09:00:00.000Z', orderId: 'b', gmvIls: 300 }),
      ],
      'day',
    )
    const totals = totalsOf(buckets)

    expect(totals.orders).toBe(2)
    expect(totals.gmvIls).toBe(400)
    expect(totals.aovIls).toBe(200)
  })

  it('is zero-safe on an empty series', () => {
    const totals = totalsOf([])

    expect(totals.orders).toBe(0)
    expect(totals.aovIls).toBe(0)
  })
})

describe('topSuppliers', () => {
  it('folds by supplier, sorts by GMV, labels the deleted', () => {
    const rows = topSuppliers([
      line({
        supplierId: 'a',
        supplierName: 'אלף',
        gmvIls: 100,
        platformFeeIls: 10,
        supplierDueIls: 90,
      }),
      line({
        supplierId: 'a',
        supplierName: 'אלף',
        gmvIls: 50,
        platformFeeIls: 5,
        supplierDueIls: 45,
      }),
      line({
        supplierId: 'b',
        supplierName: 'בית',
        gmvIls: 200,
        platformFeeIls: 20,
        supplierDueIls: 0,
      }),
      line({
        supplierId: null,
        supplierName: null,
        gmvIls: 1,
        platformFeeIls: 0,
        supplierDueIls: 0,
      }),
    ])
    expect(rows.map((r) => r.supplierName)).toEqual(['בית', 'אלף', 'ספק שנמחק'])
    expect(rows[1]).toMatchObject({
      items: 2,
      gmvIls: 150,
      platformRevenueIls: 15,
      supplierDueIls: 135,
    })
  })
})
