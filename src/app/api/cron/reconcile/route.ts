import { adminAlertDedupeKey, adminAlertRecipient } from '@/lib/email/admin-alerts'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getCardcomAccounts, getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import {
  type LocalPayment,
  type TerminalTransaction,
  reconcileAgainstTerminal,
} from '@/lib/payments/terminal-reconciliation'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The daily diff between what we think we charged and what the TERMINAL says.
 *
 * WHY THIS IS NOT COVERED BY THE RECONCILIATION THAT ALREADY EXISTS.
 * `/admin/payments` compares `payments` against `orders`, and both are our own
 * tables. It finds an order that closed without a charge, and a charge that
 * never finalized. It cannot find the failure that costs the most: money that
 * moved at Cardcom and left NO ROW HERE AT ALL, because the request died
 * between the provider accepting the charge and our transaction committing.
 * From inside our own database that is invisible by construction - there is
 * nothing to notice, and no support ticket will cite an order number because
 * none exists.
 *
 * The only way to see it is to ask the terminal and diff, which is this.
 *
 * A 48-HOUR WINDOW FOR A DAILY JOB, ON PURPOSE. The overlap means a transaction
 * that landed either side of midnight is seen twice rather than never, and a
 * single skipped run does not create a permanent blind spot. The cost is that a
 * discrepancy is reported on two consecutive days, which the dedupe key below
 * collapses to one alert.
 *
 * EVERY TERMINAL, NOT JUST THE PLATFORM ONE. Cardcom scopes a deal to the
 * terminal that took it, so a report pulled from one account is silent about
 * the others - and this project runs a terminal per supplier account.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

const WINDOW_HOURS = 48

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // No credentials is not a failure of this job. Same distinction the invoice
  // queue and the notification outbox already draw: a machine that was never
  // configured to talk to Cardcom must not report every payment as missing.
  const env = loadCardcomEnv()
  if (!env.checkoutEnabled) {
    return NextResponse.json({ ok: true, skipped: 'provider_unconfigured' })
  }

  const admin = createAdminClient()
  const to = new Date()
  const from = new Date(to.getTime() - WINDOW_HOURS * 60 * 60 * 1000)

  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )

  const { data: rows, error } = await admin
    .from('payments')
    .select(
      `id, order_id, status, kind, cardcom_transaction_id, cardcom_account_id, ${money.amountColumn}`,
    )
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .limit(5000)

  if (error) {
    log.error('reconcile.payments_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const payments = (rows ?? []) as unknown as (Record<string, unknown> & {
    id: string
    order_id: string
    status: string
    kind: 'charge' | 'refund' | null
    cardcom_transaction_id: string | null
    cardcom_account_id: string | null
  })[]

  const registry = getCardcomAccounts()
  // Every terminal, not just the platform one: Cardcom scopes a deal to the
  // terminal that took it, so a report pulled from one account is silent about
  // every other, and this project runs a terminal per supplier account.
  const accounts = registry.list()
  const perAccount: { account: string; matched: number; critical: number }[] = []
  const allDiscrepancies: ReturnType<typeof reconcileAgainstTerminal>['discrepancies'] = []

  for (const account of accounts) {
    const listed = await getPaymentProvider(account.id).listTransactions({
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    })

    if (!listed.ok) {
      // A terminal that could not be reached is not a discrepancy. Reporting it
      // as one would say money is missing when the truth is that we could not
      // ask.
      log.warn('reconcile.terminal_unreachable', { account: account.id, reason: listed.reason })
      continue
    }

    const terminal: TerminalTransaction[] = listed.transactions
    const local: LocalPayment[] = payments
      // A payment with no account id predates the multi-terminal registry and
      // belongs to the platform terminal, which is what `registry.get(null)`
      // answers. Defaulting to `accounts[0]` instead would silently reassign
      // those rows if the list order ever changed.
      .filter((row) => registry.get(row.cardcom_account_id).id === account.id)
      .map((row) => ({
        paymentId: row.id,
        orderId: row.order_id,
        transactionId: row.cardcom_transaction_id,
        amountAgorot: readAmountAgorot(money, row) ?? 0,
        status: row.status,
        kind: row.kind,
      }))

    const report = reconcileAgainstTerminal(terminal, local)
    perAccount.push({ account: account.id, matched: report.matched, critical: report.critical })
    allDiscrepancies.push(...report.discrepancies)
  }

  const critical = allDiscrepancies.filter(
    (d) => d.kind === 'missing_locally' || d.kind === 'amount_mismatch',
  )

  if (critical.length > 0) {
    // Keyed on the DAY, not the moment: the 48-hour window means the same
    // discrepancy is found on two consecutive runs, and a per-run key would
    // mail twice about one problem.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const { error: alertError } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'reconciliation_gap',
      p_email: adminAlertRecipient(),
      p_dedupe: adminAlertDedupeKey('reconciliation_gap', today),
      p_payload: {
        day: today,
        critical: critical.length,
        // Capped: an alert that lists two hundred rows is an alert nobody
        // reads. The full set is in the response and in the log.
        rows: critical.slice(0, 20),
      },
    })
    if (alertError) {
      log.error('reconcile.alert_failed', { reason: alertError.message })
    }
    log.error('reconcile.gaps_found', { critical: critical.length })
  }

  return NextResponse.json({
    ok: true,
    window_hours: WINDOW_HOURS,
    accounts: perAccount,
    discrepancies: allDiscrepancies.length,
    critical: critical.length,
  })
}

export const GET = withRequestLog('/api/cron/reconcile', handleGET)
