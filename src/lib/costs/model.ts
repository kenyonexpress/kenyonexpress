/**
 * What the infrastructure costs, projected, and divided by orders -- with the
 * two places that division lies about signposted rather than smoothed over.
 *
 * MONEY HERE IS `micro`: integer millionths of `currency`. Same unit and same
 * reason as `sms_messages.price_micro` -- these are VENDOR COSTS in foreign
 * currency, quoted to five and six decimal places, and agorot would need an FX
 * rate the row does not have while rounding a $0.0075 unit price to 1 agora.
 * Nothing here is on the customer money path and `src/lib/money.ts` is
 * untouched.
 *
 * =========================================================================
 * TRAP 1: A LINEAR PROJECTION OF A SUBSCRIPTION IS NONSENSE
 * =========================================================================
 *
 * The obvious month-end projection is `spent_so_far / day * days_in_month`. On
 * day 3 of a month where Vercel and Supabase have already charged their whole
 * monthly subscription, that says the month will cost TEN TIMES the bill. An
 * alert fires, somebody investigates, finds nothing, and learns to ignore the
 * alert -- which is the only lasting effect.
 *
 * So a cost is either FIXED (a subscription, charged once, already whole) or
 * VARIABLE (per-request, per-message, per-gigabyte, accruing through the
 * month). Only the variable part is extrapolated. A provider whose split is
 * unknown is treated as fixed, because that is the direction that under-alerts
 * rather than crying wolf.
 *
 * =========================================================================
 * TRAP 2: COST PER ORDER AT LOW VOLUME IS A DIVISION BY THE WRONG THING
 * =========================================================================
 *
 * Production has FOUR orders, total, as of 2026-09-09. Dividing a monthly
 * platform bill by four produces a large, precise, authoritative-looking number
 * that says nothing about what one more order costs -- because almost none of
 * it moves when an order is placed.
 *
 * The number that answers "what does an order cost" is the VARIABLE cost per
 * order. The number that answers "what does the shop cost" is the total. This
 * module returns both, plus the order count, and `isMeaningful` so a page can
 * refuse to print a headline figure that is really a subscription divided by a
 * small integer.
 */

export type CostKind = 'fixed' | 'variable'

export interface CostLine {
  provider: string
  /** Integer millionths of `currency`. */
  amountMicro: number
  currency: string
  kind: CostKind
  /** Where the number came from. A manual figure is not a measured one. */
  source: 'api' | 'manual'
}

export interface MonthProjection {
  /** Everything booked so far, fixed and variable. */
  spentMicro: number
  fixedMicro: number
  variableMicro: number
  /** Fixed as-is, plus variable extrapolated to the end of the month. */
  projectedMicro: number
  currency: string
  /** True when a currency other than the reporting one was dropped. */
  mixedCurrency: boolean
}

const MICRO = 1_000_000

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

/**
 * Sums the lines and extrapolates only what actually accrues.
 *
 * `dayOfMonth` is 1-based and `daysInMonth` is that month's real length, so a
 * caller cannot silently assume 30. On day 1 the variable part is multiplied by
 * `daysInMonth`, which is the correct extrapolation of one day of data and is
 * also the noisiest -- the caller decides whether a projection that early is
 * worth alerting on.
 *
 * LINES IN ANOTHER CURRENCY ARE DROPPED, NOT CONVERTED. There is no rate here,
 * and inventing one would produce a total that looks authoritative and is
 * wrong by whatever the rate has moved. `mixedCurrency` says it happened, so a
 * page reports the omission instead of the reader discovering it.
 */
export function projectMonth(
  lines: readonly CostLine[],
  options: { dayOfMonth: number; daysInMonth: number; currency: string },
): MonthProjection {
  const { currency } = options
  const day = Math.max(1, Math.min(options.dayOfMonth, options.daysInMonth))
  const days = Math.max(1, options.daysInMonth)

  let fixedMicro = 0
  let variableMicro = 0
  let mixedCurrency = false

  for (const line of lines) {
    if (line.currency !== currency) {
      mixedCurrency = true
      continue
    }
    if (line.kind === 'variable') variableMicro += round(line.amountMicro)
    else fixedMicro += round(line.amountMicro)
  }

  const projectedVariable = round((variableMicro / day) * days)

  return {
    spentMicro: fixedMicro + variableMicro,
    fixedMicro,
    variableMicro,
    projectedMicro: fixedMicro + projectedVariable,
    currency,
    mixedCurrency,
  }
}

export interface BudgetVerdict {
  /** The month's ceiling, in the same micro units. */
  budgetMicro: number
  projectedMicro: number
  overMicro: number
  /** Projected as a percentage of budget, rounded to a whole number. */
  percentOfBudget: number
  breached: boolean
}

/**
 * Is the month heading over budget?
 *
 * ON THE PROJECTION AND NOT ON THE SPEND, deliberately. An alert that fires
 * when the money is already gone is a receipt. The whole value of a threshold
 * is arriving while the month can still be changed.
 *
 * A budget of zero is "no budget set" and never breaches. Alerting against a
 * ceiling nobody chose is how a dashboard trains its reader to dismiss it.
 */
export function checkBudget(projectedMicro: number, budgetMicro: number): BudgetVerdict {
  const projected = round(projectedMicro)
  const budget = round(budgetMicro)

  if (budget <= 0) {
    return {
      budgetMicro: 0,
      projectedMicro: projected,
      overMicro: 0,
      percentOfBudget: 0,
      breached: false,
    }
  }

  return {
    budgetMicro: budget,
    projectedMicro: projected,
    overMicro: Math.max(0, projected - budget),
    percentOfBudget: Math.round((projected / budget) * 100),
    breached: projected > budget,
  }
}

export interface OrderEconomics {
  orders: number
  /** Total spend divided by orders. What the shop costs, per order. */
  totalPerOrderMicro: number
  /** Variable spend divided by orders. What ONE MORE order costs. */
  marginalPerOrderMicro: number
  /**
   * Whether `totalPerOrderMicro` is worth showing as a headline.
   *
   * False at low volume, where it is a subscription divided by a small integer
   * and moves violently with one more sale. The marginal figure stays useful at
   * any volume, because it is the only one that describes an order.
   */
  isMeaningful: boolean
}

/**
 * The volume below which a total-per-order figure says more about the
 * subscription than about the orders.
 *
 * Thirty is a judgement, not a measurement, and it is written here as one
 * number rather than scattered as a condition: at thirty orders one more sale
 * moves the figure by about 3%, which is noise rather than a signal. Production
 * had FOUR orders when this was written, where one more sale moves it by 25%.
 */
export const MEANINGFUL_ORDER_FLOOR = 30

export function perOrder(projection: MonthProjection, orders: number): OrderEconomics {
  const count = Math.max(0, Math.trunc(orders))
  if (count === 0) {
    return {
      orders: 0,
      totalPerOrderMicro: 0,
      marginalPerOrderMicro: 0,
      isMeaningful: false,
    }
  }

  return {
    orders: count,
    totalPerOrderMicro: round(projection.spentMicro / count),
    marginalPerOrderMicro: round(projection.variableMicro / count),
    isMeaningful: count >= MEANINGFUL_ORDER_FLOOR,
  }
}

/**
 * Micro units to a human string, for a screen rather than for arithmetic.
 *
 * Two decimal places, because that is what an invoice shows, and the precision
 * that was kept in the column is there for summing rather than for display.
 */
export function formatMicro(amountMicro: number, currency: string): string {
  const units = round(amountMicro) / MICRO
  const symbol = currency === 'USD' ? '$' : currency === 'ILS' ? '₪' : `${currency} `
  return `${symbol}${units.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ---------------------------------------------------------------------------
// the trend
// ---------------------------------------------------------------------------

/** One closed month of spend, for the trend. */
export interface TrendMonth {
  /** `YYYY-MM-01`, the same key `infra_costs.month` uses. */
  month: string
  fixedMicro: number
  variableMicro: number
  /** Orders paid in that month. Zero is a real answer, not a gap. */
  orders: number
}

export interface TrendPoint extends TrendMonth {
  /** `2026-08`, for the axis. */
  label: string
  totalMicro: number
  /**
   * Total divided by orders, or null when there were none.
   *
   * NULL AND NOT ZERO. A month with no orders has no cost per order; printing
   * zero would draw a line to the floor and read as "orders were free that
   * month", which is the opposite of what happened -- the fixed bill was paid
   * and nothing was sold.
   */
  perOrderMicro: number | null
}

/**
 * The last `count` months ending at `endMonth`, oldest first, with a point for
 * every month whether or not anything was recorded in it.
 *
 * A MISSING MONTH IS DRAWN AS ZERO AND NOT SKIPPED. The gap is the information:
 * a trend that silently omits the months nobody entered figures for shows a
 * smooth line across a hole and invites the reader to believe spending was
 * continuous. Skipping also makes the axis lie about spacing, because the
 * points either side of the hole sit next to each other.
 *
 * Pure: the caller supplies the rows and the end month, so the boundary
 * arithmetic is testable without a clock.
 */
export function trendPoints(
  rows: readonly TrendMonth[],
  endMonth: Date,
  count: number,
): TrendPoint[] {
  const byMonth = new Map<string, TrendMonth>()
  for (const row of rows) byMonth.set(row.month, row)

  const points: TrendPoint[] = []
  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - back, 1))
    const month = date.toISOString().slice(0, 10)
    const row = byMonth.get(month)
    const fixedMicro = round(row?.fixedMicro ?? 0)
    const variableMicro = round(row?.variableMicro ?? 0)
    const orders = row?.orders ?? 0
    const totalMicro = fixedMicro + variableMicro
    points.push({
      month,
      label: month.slice(0, 7),
      fixedMicro,
      variableMicro,
      orders,
      totalMicro,
      perOrderMicro: orders > 0 ? round(totalMicro / orders) : null,
    })
  }
  return points
}
