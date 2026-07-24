// Aggregation engine for the admin analytics dashboard.
//
// Every number on the dashboard is computed here, from order-time snapshot
// columns, and nowhere else. Two rules the whole file exists to enforce:
//
//   1. Money never comes from behavioral events. Events count behavior;
//      revenue is read from orders / order_items, which froze platform_fee_ils
//      and platform_percent at purchase time. Changing a commission today can
//      never move a past report.
//   2. A business day is an Asia/Jerusalem day. Bucketing a UTC timestamp with
//      a naive date cut would move every evening order into the wrong day.

export type Period = 'day' | 'week' | 'month'

export type SaleLine = {
  /** ISO timestamp of orders.paid_at. */
  paidAt: string
  orderId: string
  productId: string | null
  productName: string | null
  /** 'coupon' or 'physical'. */
  productType: string
  /** platform_percent as snapshotted on the order item, not today's value. */
  platformPercent: number | null
  gmvIls: number
  chargedOnSiteIls: number
  platformFeeIls: number
  supplierDueIls: number
}

export type PeriodBucket = {
  key: string
  orders: number
  items: number
  gmvIls: number
  chargedOnSiteIls: number
  platformRevenueIls: number
  supplierDueIls: number
  aovIls: number
}

export type ProductRow = {
  productId: string | null
  productName: string
  productType: string
  units: number
  gmvIls: number
  platformRevenueIls: number
}

export type TypeSplitRow = {
  productType: string
  orders: number
  items: number
  gmvIls: number
  chargedOnSiteIls: number
  platformRevenueIls: number
  gmvSharePct: number
}

export type TakeRateRow = {
  platformPercent: number | null
  orders: number
  items: number
  gmvIls: number
  platformRevenueIls: number
  effectiveTakeRatePct: number | null
}

export type FunnelRow = {
  sessions: number
  productViews: number
  addToCarts: number
  checkoutSteps: number
  checkouts: number
  purchases: number
}

export type FunnelStep = {
  key: keyof FunnelRow
  label: string
  value: number
  /** Conversion from the previous step, null for the first one. */
  fromPreviousPct: number | null
  /** Conversion from the top of the funnel. */
  fromTopPct: number | null
}

const ILS_ROUNDING = 100

/** Money is summed at full precision and rounded once, at the end. */
function round2(value: number): number {
  return Math.round(value * ILS_ROUNDING) / ILS_ROUNDING
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// en-CA gives ISO-shaped YYYY-MM-DD, which sorts lexicographically.
const israelDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Israel business day of a timestamp, as YYYY-MM-DD. Mirrors fn_il_date. */
export function israelDayKey(iso: string): string {
  return israelDayFormatter.format(new Date(iso))
}

/**
 * Bucket key for a timestamp. Weeks start on Sunday: this is an Israeli
 * business, and the SQL views agree (v_channel_revenue_weekly, migration 052).
 */
export function periodKey(iso: string, period: Period): string {
  const day = israelDayKey(iso)
  if (period === 'day') return day
  if (period === 'month') return `${day.slice(0, 7)}-01`

  // Parsed as UTC noon so the day arithmetic below cannot slip across a DST
  // boundary; only the calendar date matters here, never the clock time.
  const [year, month, date] = day.split('-')
  const anchor = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date), 12))
  anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay())
  return anchor.toISOString().slice(0, 10)
}

/**
 * Sales per period. Orders are counted distinctly, because one order produces
 * one line per item and counting rows would inflate every order-based metric.
 */
export function bucketSales(lines: SaleLine[], period: Period): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket & { orderIds: Set<string> }>()

  for (const line of lines) {
    const key = periodKey(line.paidAt, period)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        key,
        orders: 0,
        items: 0,
        gmvIls: 0,
        chargedOnSiteIls: 0,
        platformRevenueIls: 0,
        supplierDueIls: 0,
        aovIls: 0,
        orderIds: new Set<string>(),
      }
      buckets.set(key, bucket)
    }
    bucket.orderIds.add(line.orderId)
    bucket.items += 1
    bucket.gmvIls += line.gmvIls
    bucket.chargedOnSiteIls += line.chargedOnSiteIls
    bucket.platformRevenueIls += line.platformFeeIls
    bucket.supplierDueIls += line.supplierDueIls
  }

  return [...buckets.values()]
    .map(({ orderIds, ...bucket }) => ({
      ...bucket,
      orders: orderIds.size,
      gmvIls: round2(bucket.gmvIls),
      chargedOnSiteIls: round2(bucket.chargedOnSiteIls),
      platformRevenueIls: round2(bucket.platformRevenueIls),
      supplierDueIls: round2(bucket.supplierDueIls),
      aovIls: orderIds.size > 0 ? round2(bucket.gmvIls / orderIds.size) : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** Best sellers by GMV. Ties break on units, then name, so the order is stable. */
export function topProducts(lines: SaleLine[], limit = 10): ProductRow[] {
  const rows = new Map<string, ProductRow>()

  for (const line of lines) {
    const key = line.productId ?? `unknown:${line.productName ?? ''}`
    let row = rows.get(key)
    if (!row) {
      row = {
        productId: line.productId,
        productName: line.productName ?? 'מוצר שנמחק',
        productType: line.productType,
        units: 0,
        gmvIls: 0,
        platformRevenueIls: 0,
      }
      rows.set(key, row)
    }
    row.units += 1
    row.gmvIls += line.gmvIls
    row.platformRevenueIls += line.platformFeeIls
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      gmvIls: round2(row.gmvIls),
      platformRevenueIls: round2(row.platformRevenueIls),
    }))
    .sort(
      (a, b) =>
        b.gmvIls - a.gmvIls ||
        b.units - a.units ||
        a.productName.localeCompare(b.productName, 'he'),
    )
    .slice(0, limit)
}

/**
 * Coupon versus physical. The share is of GMV, and GMV counts a coupon at face
 * value while only part of it was charged on site, which is exactly why
 * chargedOnSiteIls is reported next to it rather than instead of it.
 */
export function splitByProductType(lines: SaleLine[]): TypeSplitRow[] {
  const rows = new Map<string, TypeSplitRow & { orderIds: Set<string> }>()
  let totalGmv = 0

  for (const line of lines) {
    let row = rows.get(line.productType)
    if (!row) {
      row = {
        productType: line.productType,
        orders: 0,
        items: 0,
        gmvIls: 0,
        chargedOnSiteIls: 0,
        platformRevenueIls: 0,
        gmvSharePct: 0,
        orderIds: new Set<string>(),
      }
      rows.set(line.productType, row)
    }
    row.orderIds.add(line.orderId)
    row.items += 1
    row.gmvIls += line.gmvIls
    row.chargedOnSiteIls += line.chargedOnSiteIls
    row.platformRevenueIls += line.platformFeeIls
    totalGmv += line.gmvIls
  }

  return [...rows.values()]
    .map(({ orderIds, ...row }) => ({
      ...row,
      orders: orderIds.size,
      gmvIls: round2(row.gmvIls),
      chargedOnSiteIls: round2(row.chargedOnSiteIls),
      platformRevenueIls: round2(row.platformRevenueIls),
      gmvSharePct: totalGmv > 0 ? round1((100 * row.gmvIls) / totalGmv) : 0,
    }))
    .sort((a, b) => b.gmvIls - a.gmvIls)
}

/**
 * Platform revenue per snapshotted platform_percent tier.
 *
 * effectiveTakeRatePct is intentionally not equal to platformPercent for
 * coupons: GMV is face value while the fee was taken on what was charged on
 * site. The gap between the two columns is the point of the table.
 */
export function takeRateByPlatformPercent(lines: SaleLine[]): TakeRateRow[] {
  const rows = new Map<string, TakeRateRow & { orderIds: Set<string> }>()

  for (const line of lines) {
    const key = line.platformPercent === null ? 'null' : String(line.platformPercent)
    let row = rows.get(key)
    if (!row) {
      row = {
        platformPercent: line.platformPercent,
        orders: 0,
        items: 0,
        gmvIls: 0,
        platformRevenueIls: 0,
        effectiveTakeRatePct: null,
        orderIds: new Set<string>(),
      }
      rows.set(key, row)
    }
    row.orderIds.add(line.orderId)
    row.items += 1
    row.gmvIls += line.gmvIls
    row.platformRevenueIls += line.platformFeeIls
  }

  return [...rows.values()]
    .map(({ orderIds, ...row }) => ({
      ...row,
      orders: orderIds.size,
      gmvIls: round2(row.gmvIls),
      platformRevenueIls: round2(row.platformRevenueIls),
      effectiveTakeRatePct:
        row.gmvIls > 0 ? round2((100 * row.platformRevenueIls) / row.gmvIls) : null,
    }))
    .sort((a, b) => (b.platformPercent ?? -1) - (a.platformPercent ?? -1))
}

const FUNNEL_LABELS: Array<[keyof FunnelRow, string]> = [
  ['sessions', 'ביקורים'],
  ['productViews', 'צפיות במוצר'],
  ['addToCarts', 'הוספות לעגלה'],
  ['checkoutSteps', 'שלבי תשלום'],
  ['checkouts', 'התחלות תשלום'],
  ['purchases', 'רכישות'],
]

/**
 * Turns raw funnel counts into steps with conversion rates.
 *
 * The rates are computed here rather than in SQL on purpose: the view stores
 * one raw number per step, and every ratio anyone wants is derived from those.
 * Two sources for the same percentage is how dashboards start disagreeing.
 *
 * A step whose predecessor is zero has no defined conversion, so it reports
 * null rather than 0: "no data" and "nobody converted" are different answers.
 */
export function funnelWithRates(row: FunnelRow): FunnelStep[] {
  // sessions is the top of the funnel by definition; every later step is a
  // subset of it. Carrying the previous value forward beats index arithmetic.
  const top = row.sessions
  let previous: number | null = null

  return FUNNEL_LABELS.map(([key, label]) => {
    const value = row[key]
    const step: FunnelStep = {
      key,
      label,
      value,
      fromPreviousPct:
        previous === null || previous === 0 ? null : round1((100 * value) / previous),
      fromTopPct: previous === null || top === 0 ? null : round1((100 * value) / top),
    }
    previous = value
    return step
  })
}

/** Sums a series into the totals shown in the KPI row above the charts. */
export function totalsOf(buckets: PeriodBucket[]): Omit<PeriodBucket, 'key'> {
  const totals = buckets.reduce(
    (acc, bucket) => ({
      orders: acc.orders + bucket.orders,
      items: acc.items + bucket.items,
      gmvIls: acc.gmvIls + bucket.gmvIls,
      chargedOnSiteIls: acc.chargedOnSiteIls + bucket.chargedOnSiteIls,
      platformRevenueIls: acc.platformRevenueIls + bucket.platformRevenueIls,
      supplierDueIls: acc.supplierDueIls + bucket.supplierDueIls,
      aovIls: 0,
    }),
    {
      orders: 0,
      items: 0,
      gmvIls: 0,
      chargedOnSiteIls: 0,
      platformRevenueIls: 0,
      supplierDueIls: 0,
      aovIls: 0,
    },
  )

  return {
    ...totals,
    gmvIls: round2(totals.gmvIls),
    chargedOnSiteIls: round2(totals.chargedOnSiteIls),
    platformRevenueIls: round2(totals.platformRevenueIls),
    supplierDueIls: round2(totals.supplierDueIls),
    aovIls: totals.orders > 0 ? round2(totals.gmvIls / totals.orders) : 0,
  }
}
