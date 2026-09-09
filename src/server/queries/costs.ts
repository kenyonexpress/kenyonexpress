import 'server-only'

import type { CostLine } from '@/lib/costs/model'
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
