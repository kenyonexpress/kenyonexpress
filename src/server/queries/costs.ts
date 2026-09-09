import 'server-only'

import type { CostLine, TrendMonth } from '@/lib/costs/model'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Everything the billing page needs for one month, in one place.
 *
 * READ WITH THE ADMIN CLIENT, and the page's own `requireSection` is the gate.
 * The alternative -- the request-scoped client under the `is_admin()` policy --
 * would work and would also mean the page silently shows an empty ledger to
 * anybody whose role lookup failed, which is indistinguishable from a month
 * with no spend.
 *
 * EVERY READ DEGRADES TO EMPTY WHEN ITS TABLE IS ABSENT. 219 is written and
 * unapplied, so that is the normal state today: the page renders as "no figures
 * entered yet", which is the truth, rather than failing.
 */

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export interface MonthCosts {
  lines: CostLine[]
  budgetMicro: number
  currency: string
  /** Orders paid in the month, for the per-order figures. */
  orders: number
  /** SMS spend measured locally, in micro USD. See below for why it is apart. */
  smsMicro: number
  smsMessages: number
  /** Tables that are not there yet, so the page can say which. */
  missing: string[]
}

function monthBounds(month: Date): { first: string; nextFirst: string } {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const nextFirst = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
  return {
    first: first.toISOString().slice(0, 10),
    nextFirst: nextFirst.toISOString().slice(0, 10),
  }
}

export async function loadMonthCosts(month: Date, currency = 'USD'): Promise<MonthCosts> {
  const admin = createAdminClient()
  const { first, nextFirst } = monthBounds(month)
  const missing: string[] = []

  const { data: costRows, error: costsError } = await admin
    .from('infra_costs' as never)
    .select('provider, kind, amount_micro, currency, source')
    .eq('month', first)

  if (costsError && MISSING_TABLE.has(costsError.code ?? '')) missing.push('infra_costs')
  else if (costsError) log.warn('costs.read_failed', { reason: costsError.message })

  const lines: CostLine[] = ((costRows ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => ({
      provider: String(row.provider ?? ''),
      amountMicro: Number(row.amount_micro ?? 0),
      currency: String(row.currency ?? currency),
      kind: row.kind === 'variable' ? 'variable' : 'fixed',
      source: row.source === 'api' ? 'api' : 'manual',
    }),
  )

  const { data: budgetRow, error: budgetError } = await admin
    .from('infra_budgets' as never)
    .select('amount_micro, currency')
    .eq('month', first)
    .maybeSingle()

  if (budgetError && MISSING_TABLE.has(budgetError.code ?? '')) missing.push('infra_budgets')
  else if (budgetError) log.warn('costs.budget_read_failed', { reason: budgetError.message })

  const budget = budgetRow as unknown as Record<string, unknown> | null

  // Orders PAID in the month, not created: an abandoned checkout is not an
  // order and dividing by it would flatter every per-order figure.
  const { count: orders, error: ordersError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .not('paid_at', 'is', null)
    .gte('paid_at', first)
    .lt('paid_at', nextFirst)

  if (ordersError) log.warn('costs.orders_count_failed', { reason: ordersError.message })

  // THE ONE COST MEASURED EXACTLY, and it is read here rather than entered by
  // hand: 216 stores the real per-message price from Twilio's delivery
  // receipts. `price_micro` is null until a receipt arrives, so this sums what
  // has actually been billed rather than what was sent.
  const { data: smsRows, error: smsError } = await admin
    .from('sms_messages' as never)
    .select('price_micro, price_currency')
    .gte('created_at', first)
    .lt('created_at', nextFirst)
    .not('price_micro', 'is', null)

  if (smsError && MISSING_TABLE.has(smsError.code ?? '')) missing.push('sms_messages')
  else if (smsError) log.warn('costs.sms_read_failed', { reason: smsError.message })

  let smsMicro = 0
  let smsMessages = 0
  for (const row of (smsRows ?? []) as unknown as Record<string, unknown>[]) {
    // Only the reporting currency, for the same reason `projectMonth` drops the
    // rest: there is no rate here and inventing one is worse than omitting.
    if (String(row.price_currency ?? '') !== currency) continue
    smsMicro += Number(row.price_micro ?? 0)
    smsMessages += 1
  }

  return {
    lines,
    budgetMicro: Number(budget?.amount_micro ?? 0),
    currency: String(budget?.currency ?? currency),
    orders: orders ?? 0,
    smsMicro,
    smsMessages,
    missing,
  }
}

/**
 * The last `months` months of spend, for the trend on the billing page.
 *
 * THREE READS AND A JOIN IN MEMORY, not one grouped query. PostgREST cannot
 * `group by` without a view or an RPC, and adding either for a chart on a page
 * one person opens would be a schema change to save three round trips on an
 * admin route. The row counts are bounded by the window: twelve months of
 * infra_costs is at most a few dozen rows.
 *
 * EVERY READ DEGRADES TO EMPTY when its table is absent, exactly as
 * `loadMonthCosts` does -- 219 is unapplied, so an empty trend is today's
 * correct answer and not a failure. `trendPoints` then draws twelve zero
 * months, which is the honest picture of a ledger nobody has filled in.
 *
 * Orders are counted per month with one query each rather than by reading every
 * paid order into memory: a count with `head: true` transfers no rows, and
 * twelve of them is cheaper than paging the orders table for a chart.
 */
export async function loadCostTrend(
  endMonth: Date,
  months: number,
  currency = 'USD',
): Promise<TrendMonth[]> {
  const admin = createAdminClient()
  const first = new Date(
    Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - (months - 1), 1),
  )
  const nextFirst = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, 1))
  const windowStart = first.toISOString().slice(0, 10)
  const windowEnd = nextFirst.toISOString().slice(0, 10)

  const rows = new Map<string, TrendMonth>()
  const ensure = (month: string): TrendMonth => {
    const existing = rows.get(month)
    if (existing) return existing
    const created: TrendMonth = { month, fixedMicro: 0, variableMicro: 0, orders: 0 }
    rows.set(month, created)
    return created
  }

  const { data: costRows, error: costsError } = await admin
    .from('infra_costs' as never)
    .select('month, kind, amount_micro, currency')
    .gte('month', windowStart)
    .lt('month', windowEnd)

  if (costsError && !MISSING_TABLE.has(costsError.code ?? '')) {
    log.warn('costs.trend_read_failed', { reason: costsError.message })
  }

  for (const row of (costRows ?? []) as unknown as Record<string, unknown>[]) {
    // Another currency is dropped rather than converted, the same rule
    // `projectMonth` applies. A chart is scanned rather than read, which makes
    // a silently converted figure on it harder to catch, not easier.
    if (String(row.currency ?? currency) !== currency) continue
    const month = String(row.month ?? '').slice(0, 10)
    if (!month) continue
    const point = ensure(month)
    const amount = Number(row.amount_micro ?? 0)
    if (row.kind === 'variable') point.variableMicro += amount
    else point.fixedMicro += amount
  }

  const { data: smsRows, error: smsError } = await admin
    .from('sms_messages' as never)
    .select('created_at, price_micro, price_currency')
    .gte('created_at', windowStart)
    .lt('created_at', windowEnd)
    .not('price_micro', 'is', null)

  if (smsError && !MISSING_TABLE.has(smsError.code ?? '')) {
    log.warn('costs.trend_sms_failed', { reason: smsError.message })
  }

  for (const row of (smsRows ?? []) as unknown as Record<string, unknown>[]) {
    if (String(row.price_currency ?? '') !== currency) continue
    // SMS is variable by definition: it is spent one message at a time.
    ensure(`${String(row.created_at ?? '').slice(0, 7)}-01`).variableMicro += Number(
      row.price_micro ?? 0,
    )
  }

  for (let back = months - 1; back >= 0; back--) {
    const monthStart = new Date(
      Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - back, 1),
    )
    const monthEnd = new Date(
      Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - back + 1, 1),
    )
    const { count, error } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('paid_at', 'is', null)
      .gte('paid_at', monthStart.toISOString().slice(0, 10))
      .lt('paid_at', monthEnd.toISOString().slice(0, 10))

    if (error) {
      log.warn('costs.trend_orders_failed', { reason: error.message })
      continue
    }
    ensure(monthStart.toISOString().slice(0, 10)).orders = count ?? 0
  }

  return [...rows.values()]
}
