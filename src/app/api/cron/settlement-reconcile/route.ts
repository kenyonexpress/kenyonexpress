import { adminAlertDedupeKey, adminAlertRecipient } from '@/lib/email/admin-alerts'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  KNOWN_SETTLEMENT_ISSUES,
  SETTLEMENT_ISSUES_MEASURED_AT,
} from '@/lib/payments/settlement-known-issues'
import {
  type CompletedRefund,
  type JournalEvent,
  type SettledOrderLine,
  reconcileSettlement,
} from '@/lib/payments/settlement-reconciliation'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The daily diff between what an order line SAYS it was split at and what it
 * WAS split at, and between both of those and the money journal.
 *
 * WHY THIS IS NOT COVERED BY THE RECONCILIATION THAT ALREADY EXISTS.
 * `/api/cron/reconcile` asks Cardcom what it charged and diffs that against
 * `payments`. It answers "did the right total move". This asks the question
 * that comes after: of that total, how much is the platform's and how much is
 * the supplier's. Those are different failures with different blast radii -- a
 * total that is wrong is a customer complaint, a split that is wrong is a
 * supplier paid the wrong amount for months without either side noticing,
 * because the statement and the terminal agree with each other perfectly.
 *
 * Production, 2026-09-09: all three paid lines carry a `platform_percent` that
 * does not produce the commission on the same row. Every one was split at a
 * flat 5% against snapshots of 10%, 10% and 100%. Nothing in the repository
 * compared those two columns until this.
 *
 * WHY IT REPORTS AND DOES NOT REPAIR. Deciding whether the ₪799 supplier is
 * owed ₪0 or ₪759.05 is the operator's call, and acting on it is a write to
 * production money rows. A job that guessed would turn one wrong number into
 * one wrong number plus an audit trail saying it was reviewed.
 *
 * THE FLOOR. `supabase/settlement-known-issues.json` holds what is already
 * true, so the alert fires on a NEW finding rather than on the same three rows
 * from July every night. An entry that stops firing is reported too: it means
 * somebody fixed it, or the check broke, and those look identical from here.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

/**
 * When `settlement_events` started recording: migration 094, applied to
 * production on 2026-07-31. A line paid before this was never journalled
 * because there was nothing to journal into, which is not a fault of the line.
 */
const JOURNAL_EPOCH_ISO = '2026-07-31T00:00:00.000Z'

/** Statuses in which the customer's money has moved and a split exists. */
const SETTLED_STATUSES = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
  'refunded',
] as const

const ROW_LIMIT = 5000

/** An alert listing two hundred rows is an alert nobody reads. */
const ALERT_ROW_CAP = 20

/**
 * The kind is not in production's `notification_outbox_kind_check` yet; it
 * arrives with migrations/pending/214. Re-measured 2026-09-10: the live check
 * carries sixteen kinds and `settlement_gap` is not one of them, so until 214
 * is applied every enqueue here fails with 23514, which this reads and carries
 * on from. Degrading to "found the problems, could not mail about them, said so
 * in the log" beats throwing in a cron at 04:20.
 *
 * The `price_drop` comparison this used to draw is gone: that kind IS accepted
 * now, and citing it as a fellow-rejected kind made a live path read as dead.
 */
const KIND_NOT_ACCEPTED = '23514'

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  // Two reads and a join in memory, rather than one PostgREST embed. The embed
  // would put the filter that decides which lines are checked (`orders.status`)
  // inside a select string, where a typo silently widens or empties the set
  // instead of failing.
  const { data: orderRows, error: ordersError } = await admin
    .from('orders')
    .select('id, status, paid_at, created_at')
    .in('status', SETTLED_STATUSES as unknown as string[])
    .is('deleted_at', null)
    .limit(ROW_LIMIT)

  if (ordersError) {
    log.error('settlement_reconcile.orders_read_failed', { reason: ordersError.message })
    return NextResponse.json({ ok: false, error: ordersError.message }, { status: 500 })
  }

  const settledOrders = new Map<string, { paidAtIso: string }>()
  for (const row of (orderRows ?? []) as unknown as Record<string, unknown>[]) {
    settledOrders.set(String(row.id), {
      // `paid_at` is the moment that decides the epoch. `created_at` is the
      // fallback and it is the CONSERVATIVE one: it is never later than
      // paid_at, so a line can only be excused by it, never wrongly accused.
      paidAtIso: String(row.paid_at ?? row.created_at ?? ''),
    })
  }

  const { data: itemRows, error: itemsError } = await admin
    .from('order_items')
    .select(
      'id, order_id, supplier_id, platform_percent, settlement_status, paid_on_site_agorot, commission_agorot, supplier_immediate_agorot, escrow_release_agorot',
    )
    .is('deleted_at', null)
    .limit(ROW_LIMIT)

  if (itemsError) {
    log.error('settlement_reconcile.lines_read_failed', { reason: itemsError.message })
    return NextResponse.json({ ok: false, error: itemsError.message }, { status: 500 })
  }

  const lines: SettledOrderLine[] = ((itemRows ?? []) as unknown as Record<string, unknown>[])
    .filter((row) => settledOrders.has(String(row.order_id)))
    .map((row) => ({
      orderItemId: String(row.id),
      orderId: String(row.order_id),
      supplierId: (row.supplier_id as string | null) ?? null,
      platformPercent: (row.platform_percent as string | number | null) ?? null,
      // Feeds `supplier_debit_missing`: a refunded line whose share is still
      // standing in the journal.
      settlementStatus: (row.settlement_status as string | null) ?? null,
      paidOnSiteAgorot: Number(row.paid_on_site_agorot ?? 0),
      commissionAgorot: Number(row.commission_agorot ?? 0),
      supplierImmediateAgorot: Number(row.supplier_immediate_agorot ?? 0),
      escrowReleaseAgorot: Number(row.escrow_release_agorot ?? 0),
      paidAtIso: settledOrders.get(String(row.order_id))?.paidAtIso ?? '',
    }))

  const { data: eventRows, error: eventsError } = await admin
    .from('settlement_events')
    .select(
      'kind, order_id, order_item_id, paid_on_site_agorot, commission_agorot, supplier_due_agorot, idempotency_key',
    )
    .limit(ROW_LIMIT)

  // The journal not existing is not a failed run. 094 is applied to production,
  // but a preview branch or a fresh local stack is a database where it is not,
  // and there the honest answer is an empty journal rather than a 500.
  const journalMissing = eventsError?.code === '42P01'
  if (eventsError && !journalMissing) {
    log.error('settlement_reconcile.events_read_failed', { reason: eventsError.message })
    return NextResponse.json({ ok: false, error: eventsError.message }, { status: 500 })
  }

  const events: JournalEvent[] = ((eventRows ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => ({
      kind: String(row.kind ?? ''),
      orderId: String(row.order_id ?? ''),
      orderItemId: (row.order_item_id as string | null) ?? null,
      paidOnSiteAgorot: Number(row.paid_on_site_agorot ?? 0),
      commissionAgorot: Number(row.commission_agorot ?? 0),
      supplierDueAgorot: Number(row.supplier_due_agorot ?? 0),
      idempotencyKey: (row.idempotency_key as string | null) ?? null,
    }),
  )

  const { data: refundRows, error: refundsError } = await admin
    .from('refunds')
    .select('id, order_id, payment_id, granted_agorot')
    .eq('state', 'completed')
    .limit(ROW_LIMIT)

  if (refundsError) {
    log.error('settlement_reconcile.refunds_read_failed', { reason: refundsError.message })
    return NextResponse.json({ ok: false, error: refundsError.message }, { status: 500 })
  }

  const refunds: CompletedRefund[] = (
    (refundRows ?? []) as unknown as Record<string, unknown>[]
  ).map((row) => ({
    refundId: String(row.id ?? ''),
    orderId: String(row.order_id ?? ''),
    paymentId: (row.payment_id as string | null) ?? null,
    grantedAgorot: Number(row.granted_agorot ?? 0),
  }))

  const report = reconcileSettlement({
    lines,
    events,
    // On a database where 094 was never applied there is no journal to be
    // missing from, so the epoch moves past every row and every journal check
    // falls silent. The split and percent checks are unaffected, which is the
    // point: those hold on any database, and they are the ones that found
    // something.
    refunds: journalMissing ? [] : refunds,
    journalEpochIso: journalMissing ? '9999-01-01T00:00:00.000Z' : JOURNAL_EPOCH_ISO,
    known: KNOWN_SETTLEMENT_ISSUES,
  })

  // Said every run, at info, whether or not anything is wrong. A job whose only
  // output is an alert is indistinguishable from a job that stopped running.
  log.info('settlement_reconcile.done', {
    lines: report.linesChecked,
    events: report.eventsChecked,
    refunds: report.refundsChecked,
    before_journal: report.beforeJournal,
    findings: report.findings.length,
    novel: report.novel.length,
    critical: report.critical,
    silenced: report.silenced.length,
    journal_missing_table: journalMissing,
  })

  if (report.silenced.length > 0) {
    // Not an alert. A finding that stopped firing is usually somebody fixing a
    // row, and paging about good news trains people to ignore the pager. It is
    // said loudly enough to be found when the ledger is next edited.
    log.warn('settlement_reconcile.ledger_stale', {
      silenced: report.silenced,
      measured_at: SETTLEMENT_ISSUES_MEASURED_AT,
    })
  }

  let alerted = false
  if (report.critical > 0) {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const { error: alertError } = await admin.rpc(
      'fn_enqueue_notification' as never,
      {
        p_kind: 'settlement_gap',
        p_email: adminAlertRecipient(),
        // Keyed on the day, like the terminal reconciliation's. Its own kind and
        // not `reconciliation_gap`: sharing one would make whichever job ran
        // first swallow the other's alert, because the dedupe key is kind + day.
        p_dedupe: adminAlertDedupeKey('settlement_gap', day),
        p_payload: {
          day,
          critical: report.critical,
          rows: report.novel.filter((f) => f.severity === 'critical').slice(0, ALERT_ROW_CAP),
        },
      } as never,
    )

    if (alertError) {
      const notAccepted = alertError.code === KIND_NOT_ACCEPTED
      log.error('settlement_reconcile.alert_failed', {
        reason: alertError.message,
        kind_not_accepted: notAccepted,
      })
    } else {
      alerted = true
    }

    log.error('settlement_reconcile.gaps_found', {
      critical: report.critical,
      kinds: [...new Set(report.novel.map((f) => f.kind))],
    })
  }

  return NextResponse.json({
    ok: true,
    lines: report.linesChecked,
    events: report.eventsChecked,
    refunds: report.refundsChecked,
    before_journal: report.beforeJournal,
    findings: report.findings.length,
    known: KNOWN_SETTLEMENT_ISSUES.length,
    novel: report.novel,
    silenced: report.silenced,
    critical: report.critical,
    alerted,
  })
}

export const GET = withRequestLog(
  '/api/cron/settlement-reconcile',
  withJobRun('settlement-reconcile', handleGET),
)
