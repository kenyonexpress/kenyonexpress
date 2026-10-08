import { divRoundHalfUp } from '@/lib/money'
import { detectPriceDrop, previousObservedPrice } from '@/lib/wishlist/alerts'

/**
 * What the storefront says about a product's price over time (STEP 59), with
 * no client and no clock of its own, so the chart, the "price dropped" badge
 * and the "lowest price ever" indicator are all decided here and tested here.
 *
 * THE RECORD IS `price_history` (193), AND THIS FILE ONLY READS IT. The table
 * is append-only, one or more rows per product per Jerusalem day, written by
 * the two daily snapshot crons, by every applied flash deal (201), and since
 * this step by every admin price edit (`price-change.ts`) and, once 264 is
 * applied, by a trigger on `products` itself. 193's header instructs the
 * reader to take the LOWEST price of a day, because a day may carry several
 * rows and the lowest is the one a shopper could actually have paid. Every
 * function below honours that, and none of them invents a price for a day
 * that was not observed.
 *
 * WHICH DAYS COUNT. Only days the product was on sale: `active` or
 * `sold_out`. A draft or paused product's price is not a price anyone could
 * pay, and 193 records the status for exactly this reason. A product hidden
 * for a month at ₪1 must not come back as "an all-time low of ₪1".
 *
 * MONEY IS INTEGER AGOROT END TO END. The drop percent is the one ratio, and
 * it goes through `divRoundHalfUp`, not a float division.
 */

/** The row shape the readers select; the same three columns the alerts read plus status. */
export interface PriceHistoryRow {
  observed_on: string
  price_agorot: number
  status: string
}

/** One day on the chart: the lowest sale price observed that day. */
export interface DailyPoint {
  day: string
  agorot: number
}

/** The statuses under which a recorded price was one a shopper could pay. */
export const SALE_STATUSES: ReadonlySet<string> = new Set(['active', 'sold_out'])

/**
 * Days of history an "all-time low" needs before the storefront will claim
 * one. A product observed for one day is trivially at its lowest; seven
 * distinct sale days is the floor at which the claim says something.
 */
export const ALL_TIME_LOW_MIN_DAYS = 7

/** The chart's window, in days, and the widest read the loaders make. */
export const CHART_WINDOW_DAYS = 90
export const HISTORY_WINDOW_DAYS = 400

function isUsableRow(row: PriceHistoryRow): boolean {
  return (
    typeof row.observed_on === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.observed_on) &&
    Number.isSafeInteger(row.price_agorot) &&
    row.price_agorot > 0 &&
    SALE_STATUSES.has(row.status)
  )
}

/**
 * One point per day, the lowest sale price of that day, ascending by day.
 * Rows under a non-sale status, with a malformed day or a non-positive price
 * are dropped rather than repaired.
 */
export function dailyLows(rows: readonly PriceHistoryRow[]): DailyPoint[] {
  const lows = new Map<string, number>()
  for (const row of rows) {
    if (!isUsableRow(row)) continue
    const current = lows.get(row.observed_on)
    if (current === undefined || row.price_agorot < current)
      lows.set(row.observed_on, row.price_agorot)
  }
  return [...lows.entries()]
    .map(([day, agorot]) => ({ day, agorot }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/**
 * What a card or a page needs from the history, with the current price left
 * out on purpose: the current price is on the product row the caller already
 * holds (and on the product page it moves live), so the summary is cached per
 * product and the comparison happens at render time in `priceSignal`.
 */
export interface HistorySummary {
  /** The lowest price of the most recent sale day before today; null on a first day. */
  previousAgorot: number | null
  /** The lowest sale price on any day before today; null with no earlier day. */
  lowestBeforeTodayAgorot: number | null
  /** Distinct sale days observed before today. */
  observedDays: number
}

export function summarizeHistory(
  rows: readonly PriceHistoryRow[],
  todayKey: string,
): HistorySummary {
  const earlier = dailyLows(rows).filter((point) => point.day < todayKey)
  let lowest: number | null = null
  for (const point of earlier) {
    if (lowest === null || point.agorot < lowest) lowest = point.agorot
  }
  return {
    previousAgorot: previousObservedPrice(
      rows
        .filter(isUsableRow)
        .map((r) => ({ observed_on: r.observed_on, price_agorot: r.price_agorot })),
      todayKey,
    ),
    lowestBeforeTodayAgorot: lowest,
    observedDays: earlier.length,
  }
}

export interface PriceSignal {
  /** Set when the price charged now is below the previous observed day's. */
  drop: { oldAgorot: number; newAgorot: number; percent: number } | null
  /** True when the price charged now is at or under every earlier sale day's low, over enough days. */
  allTimeLow: boolean
}

/**
 * The two claims a card may make, from a cached summary and the price it is
 * about to render. Null when there is nothing to claim, so a caller can test
 * `signal` alone. A drop of under one whole percent is not a drop worth a
 * badge: the amount is real but the label would read "ירד ב-0%".
 */
export function priceSignal(
  summary: HistorySummary | null | undefined,
  currentAgorot: number | null | undefined,
): PriceSignal | null {
  if (!summary) return null
  if (!Number.isSafeInteger(currentAgorot) || (currentAgorot as number) <= 0) return null
  const current = currentAgorot as number

  const raw = detectPriceDrop(summary.previousAgorot, current)
  let drop: PriceSignal['drop'] = null
  if (raw) {
    const percent = divRoundHalfUp((raw.oldAgorot - raw.newAgorot) * 100, raw.oldAgorot)
    if (percent >= 1) drop = { ...raw, percent }
  }

  const allTimeLow =
    summary.observedDays >= ALL_TIME_LOW_MIN_DAYS &&
    summary.lowestBeforeTodayAgorot !== null &&
    current <= summary.lowestBeforeTodayAgorot

  if (!drop && !allTimeLow) return null
  return { drop, allTimeLow }
}

/**
 * The days a `YYYY-MM-DD` key is from another, without a Date: the keys are
 * Jerusalem calendar days and a UTC `Date` would move midnight. Pure
 * arithmetic on the civil calendar is enough here.
 */
export function dayKeyOffset(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d + days)
  const out = new Date(t)
  const yy = out.getUTCFullYear()
  const mm = String(out.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(out.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** The points inside the chart window ending on `todayKey`, inclusive. */
export function chartSeries(
  points: readonly DailyPoint[],
  todayKey: string,
  windowDays: number = CHART_WINDOW_DAYS,
): DailyPoint[] {
  const from = dayKeyOffset(todayKey, -(windowDays - 1))
  return points.filter((p) => p.day >= from && p.day <= todayKey)
}

export interface ChartGeometry {
  width: number
  height: number
  /** The step line through every point, as a `points` attribute. */
  polyline: string
  /** The last point, for the end marker. */
  last: { x: number; y: number }
  minAgorot: number
  maxAgorot: number
  firstDay: string
  lastDay: string
}

/**
 * Pixel geometry for an inline SVG. A STEP line, because a price holds until
 * it changes: a straight slope between two observations would draw prices the
 * product never had. Days are spaced by calendar position, not by index, so a
 * missing snapshot day is a gap in time and not a squeezed chart. A flat
 * history gets a band of one agora, so the line sits on the baseline instead
 * of on a division by zero.
 */
export function chartGeometry(
  series: readonly DailyPoint[],
  width: number,
  height: number,
  padding = 4,
): ChartGeometry | null {
  if (series.length < 2) return null
  const first = series[0] as DailyPoint
  const lastPoint = series[series.length - 1] as DailyPoint
  let min = first.agorot
  let max = first.agorot
  for (const p of series) {
    if (p.agorot < min) min = p.agorot
    if (p.agorot > max) max = p.agorot
  }
  const band = Math.max(1, max - min)
  const totalDays = Math.max(1, daysBetween(first.day, lastPoint.day))
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const x = (day: string) => padding + (daysBetween(first.day, day) / totalDays) * innerW
  const y = (agorot: number) => padding + innerH - ((agorot - min) / band) * innerH

  const coords: string[] = []
  let prevY: number | null = null
  for (const p of series) {
    const px = round1(x(p.day))
    const py = round1(y(p.agorot))
    if (prevY !== null && prevY !== py) coords.push(`${px},${prevY}`)
    coords.push(`${px},${py}`)
    prevY = py
  }

  return {
    width,
    height,
    polyline: coords.join(' '),
    last: { x: round1(x(lastPoint.day)), y: round1(y(lastPoint.agorot)) },
    minAgorot: min,
    maxAgorot: max,
    firstDay: first.day,
    lastDay: lastPoint.day,
  }
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** `YYYY-MM-DD` to the `DD.MM` a Hebrew reader expects, with no Date and no zone. */
export function shortDayLabel(key: string): string {
  const [, m, d] = key.split('-')
  return `${d}.${m}`
}
