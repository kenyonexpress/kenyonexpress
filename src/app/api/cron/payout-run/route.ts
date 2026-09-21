import { agorot, agorotToIls } from '@/lib/money'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type PayoutCandidate, jerusalemDate, planSupplierPayout } from '@/lib/payouts/run'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The daily payout run (section 55).
 *
 * For every active supplier: gather the paid physical lines whose hold has
 * passed and that sit on no live statement, and if their supplier share
 * clears the supplier's minimum, draw up a `payout_statements` row with its
 * lines and tell the supplier. The arithmetic is `src/lib/payouts/run.ts`;
 * this file only reads, writes and reports.
 *
 * ONE SUPPLIER'S FAILURE IS ONE LINE IN THE REPORT. Each supplier is its own
 * try/catch; a shop whose email is malformed or whose rows raise does not stop
 * the shop after it. The summary the job returns (and `job_runs` keeps) names
 * every supplier and what happened to them, which is the section's
 * "reconciliation report": statements created, amounts rolled over, lines
 * still on hold, and statements approved but unpaid for longer than a week.
 *
 * THE TRANSFER ITSELF IS NOT AUTOMATED HERE, AND THAT IS A DECISION. Cardcom's
 * `TransferFromDigitalBank` belongs to a product this account does not have
 * (the integration is the legacy `/Interface/*.aspx` API, no transfer
 * endpoint, no credentials), and a payout engine that sends real money on a
 * schedule without a sandbox to prove it on is the one thing this project
 * refuses to build unmeasured. A statement therefore stops at
 * `pending_approval`; an admin approves it and marks it paid with the bank
 * reference, which is the audit trail 7.4 of the supplier-portal architecture
 * asks for. The "retry queue" is the `awaiting_transfer` list below: an
 * approved statement is re-reported every morning until it is marked paid.
 *
 * The statement mail goes through the outbox with kind
 * `payout_statement_ready`, which migration 233 adds. Until it lands the
 * insert fails with 23514 and the run logs that it drew up the statement and
 * could not mail about it.
 */

const KIND_NOT_ACCEPTED = '23514'
const DEFAULT_HOLD_BUSINESS_DAYS = 3
const DEFAULT_MIN_PAYOUT_ILS = 100
const AWAITING_TRANSFER_DAYS = 7
const ROW_LIMIT = 5000

type SupplierRow = {
  id: string
  name: string
  contact_email: string | null
  min_payout_ils: number | string | null
  payout_hold_business_days: number | null
}

type ItemRow = {
  id: string
  order_id: string
  quantity: number | null
  platform_percent: number | null
  total_price_ils_agorot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  supplier_immediate_agorot: number | null
  settlement_status: string | null
  fulfilled_at: string | null
  delivered_at: string | null
  products: { name_he: string | null } | { name_he: string | null }[] | null
  orders: { paid_at: string | null } | { paid_at: string | null }[] | null
}

type SupplierOutcome =
  | {
      supplier: string
      kind: 'statement'
      statement: string
      lines: number
      payout_agorot: number
      mailed: boolean
    }
  | { supplier: string; kind: 'below_minimum'; due_agorot: number; lines: number }
  | { supplier: string; kind: 'held'; held_lines: number; earliest_available_at: string }
  | { supplier: string; kind: 'undelivered'; undelivered_lines: number }
  | { supplier: string; kind: 'nothing' }
  | { supplier: string; kind: 'error'; reason: string }

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function runSupplier(supplier: SupplierRow, now: Date): Promise<SupplierOutcome> {
  const admin = createAdminClient()

  const { data: items, error: itemsError } = await admin
    .from('order_items')
    .select(
      'id, order_id, quantity, platform_percent, total_price_ils_agorot, paid_on_site_agorot, commission_agorot, supplier_immediate_agorot, settlement_status, fulfilled_at, delivered_at, products(name_he), orders!inner(paid_at)',
    )
    .eq('supplier_id', supplier.id)
    .eq('product_type', 'physical')
    .is('deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .limit(ROW_LIMIT)
  if (itemsError) throw new Error(`order_items: ${itemsError.message}`)

  const { data: statements, error: statementsError } = await admin
    .from('payout_statements')
    .select('id, period_end, status')
    .eq('supplier_id', supplier.id)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
  if (statementsError) throw new Error(`payout_statements: ${statementsError.message}`)
  const liveIds = (statements ?? []).map((s) => s.id)
  const lastPeriodEnd =
    (statements ?? [])
      .map((s) => s.period_end as string)
      .sort()
      .at(-1) ?? null

  const statementedItemIds = new Set<string>()
  if (liveIds.length > 0) {
    const { data: lines, error: linesError } = await admin
      .from('payout_statement_lines')
      .select('order_item_id')
      .in('statement_id', liveIds)
    if (linesError) throw new Error(`payout_statement_lines: ${linesError.message}`)
    for (const line of lines ?? [])
      if (line.order_item_id) statementedItemIds.add(line.order_item_id)
  }

  const candidates: PayoutCandidate[] = ((items ?? []) as unknown as ItemRow[]).map((row) => ({
    orderItemId: row.id,
    orderId: row.order_id,
    productName: one(row.products)?.name_he ?? 'פריט',
    quantity: row.quantity ?? 1,
    platformPercent: row.platform_percent,
    grossAgorot: row.total_price_ils_agorot ?? row.paid_on_site_agorot ?? 0,
    platformFeeAgorot: row.commission_agorot ?? 0,
    supplierImmediateAgorot: row.supplier_immediate_agorot ?? 0,
    settlementStatus: row.settlement_status,
    paidAt: one(row.orders)?.paid_at ?? null,
    fulfilledAt: row.fulfilled_at,
    deliveredAt: row.delivered_at,
  }))

  const minPayoutIls = Number(supplier.min_payout_ils ?? DEFAULT_MIN_PAYOUT_ILS)
  const plan = planSupplierPayout(
    {
      supplierId: supplier.id,
      candidates,
      statementedItemIds,
      holdBusinessDays: supplier.payout_hold_business_days ?? DEFAULT_HOLD_BUSINESS_DAYS,
      minPayoutAgorot: agorot(
        Math.round((Number.isFinite(minPayoutIls) ? minPayoutIls : DEFAULT_MIN_PAYOUT_ILS) * 100),
      ),
      lastPeriodEnd,
    },
    now,
  )

  if (plan.kind === 'nothing') return { supplier: supplier.id, kind: 'nothing' }
  if (plan.kind === 'held') {
    return {
      supplier: supplier.id,
      kind: 'held',
      held_lines: plan.heldLines,
      earliest_available_at: plan.earliestAvailableAt,
    }
  }
  if (plan.kind === 'undelivered') {
    return { supplier: supplier.id, kind: 'undelivered', undelivered_lines: plan.undeliveredLines }
  }
  if (plan.kind === 'below_minimum') {
    return {
      supplier: supplier.id,
      kind: 'below_minimum',
      due_agorot: plan.dueAgorot,
      lines: plan.lineCount,
    }
  }

  // The ILS-typed columns are written once, per column, from integer agorot.
  const { data: created, error: createError } = await admin
    .from('payout_statements')
    .insert({
      supplier_id: supplier.id,
      period_start: plan.periodStart,
      period_end: plan.periodEnd,
      status: 'pending_approval',
      min_payout_ils: minPayoutIls,
      total_gross_ils: agorotToIls(plan.totalGrossAgorot),
      total_platform_fee_ils: agorotToIls(plan.totalPlatformFeeAgorot),
      total_payout_ils: agorotToIls(plan.totalPayoutAgorot),
      available_at: plan.availableAt,
      notes: `נוצר אוטומטית על ידי payout-run ב-${jerusalemDate(now)}`,
    } as never)
    .select('id, statement_number')
    .single()
  if (createError || !created)
    throw new Error(`statement insert: ${createError?.message ?? 'no row'}`)
  const statement = created as { id: string; statement_number: string }

  const { error: linesInsertError } = await admin.from('payout_statement_lines').insert(
    plan.lines.map((line) => ({
      statement_id: statement.id,
      line_type: 'physical_delivery',
      order_item_id: line.orderItemId,
      description: line.description,
      quantity: line.quantity,
      gross_ils: agorotToIls(line.grossAgorot),
      platform_percent: line.platformPercent,
      platform_fee_ils: agorotToIls(line.platformFeeAgorot),
      payout_ils: agorotToIls(line.payoutAgorot),
      available_at: line.availableAt,
    })) as never,
  )
  if (linesInsertError) {
    // A statement without its lines is a number nobody can check. Cancel it
    // rather than leave it pending; the lines are still free for tomorrow.
    await admin
      .from('payout_statements')
      .update({
        status: 'cancelled',
        notes: `שורות לא נכתבו: ${linesInsertError.message}`,
      } as never)
      .eq('id', statement.id)
    throw new Error(`lines insert: ${linesInsertError.message}`)
  }

  let mailed = false
  if (supplier.contact_email) {
    const { error: mailError } = await admin.rpc(
      'fn_enqueue_notification' as never,
      {
        p_kind: 'payout_statement_ready',
        p_email: supplier.contact_email,
        p_dedupe: `payout_statement_ready:${statement.id}`,
        p_payload: {
          statement_id: statement.id,
          statement_number: statement.statement_number,
          supplier_name: supplier.name,
          period_start: plan.periodStart,
          period_end: plan.periodEnd,
          total_payout_agorot: plan.totalPayoutAgorot,
          line_count: plan.lines.length,
        },
      } as never,
    )
    if (mailError) {
      log.error('payout_run.mail_failed', {
        statementId: statement.id,
        reason: mailError.message,
        kind_not_accepted: mailError.code === KIND_NOT_ACCEPTED,
      })
    } else {
      mailed = true
    }
  }

  log.info('payout_run.statement_created', {
    supplierId: supplier.id,
    statementId: statement.id,
    statementNumber: statement.statement_number,
    lines: plan.lines.length,
    payoutAgorot: plan.totalPayoutAgorot,
    mailed,
  })
  return {
    supplier: supplier.id,
    kind: 'statement',
    statement: statement.statement_number,
    lines: plan.lines.length,
    payout_agorot: plan.totalPayoutAgorot,
    mailed,
  }
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const admin = createAdminClient()
  const now = new Date()

  const { data: suppliers, error: suppliersError } = await admin
    .from('suppliers')
    .select('id, name, contact_email, min_payout_ils, payout_hold_business_days')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (suppliersError) {
    log.error('payout_run.suppliers_read_failed', { reason: suppliersError.message })
    return NextResponse.json({ ok: false, error: suppliersError.message }, { status: 500 })
  }

  const outcomes: SupplierOutcome[] = []
  for (const supplier of (suppliers ?? []) as SupplierRow[]) {
    try {
      outcomes.push(await runSupplier(supplier, now))
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      log.error('payout_run.supplier_failed', { supplierId: supplier.id, reason })
      outcomes.push({ supplier: supplier.id, kind: 'error', reason })
    }
  }

  // Approved and not paid for a week: the queue that a manual transfer leaves
  // behind, re-reported every run until someone marks it paid.
  const cutoff = new Date(now.getTime() - AWAITING_TRANSFER_DAYS * 86_400_000).toISOString()
  const { data: awaiting, error: awaitingError } = await admin
    .from('payout_statements')
    .select('id, statement_number, supplier_id, total_payout_ils, approved_at')
    .eq('status', 'approved')
    .is('paid_at', null)
    .lte('approved_at', cutoff)
    .limit(200)
  if (awaitingError) log.warn('payout_run.awaiting_read_failed', { reason: awaitingError.message })

  const summary = {
    ok: outcomes.every((o) => o.kind !== 'error'),
    day: jerusalemDate(now),
    suppliers: outcomes.length,
    statements_created: outcomes.filter((o) => o.kind === 'statement').length,
    below_minimum: outcomes.filter((o) => o.kind === 'below_minimum').length,
    held: outcomes.filter((o) => o.kind === 'held').length,
    undelivered: outcomes.filter((o) => o.kind === 'undelivered').length,
    errors: outcomes.filter((o) => o.kind === 'error').length,
    awaiting_transfer: (awaiting ?? []).length,
    awaiting: awaiting ?? [],
    outcomes,
  }
  log.info('payout_run.completed', {
    suppliers: summary.suppliers,
    statements_created: summary.statements_created,
    below_minimum: summary.below_minimum,
    held: summary.held,
    undelivered: summary.undelivered,
    errors: summary.errors,
    awaiting_transfer: summary.awaiting_transfer,
  })
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 })
}

export const GET = withRequestLog('/api/cron/payout-run', withJobRun('payout-run', handleGET))
