import { agorot } from '@/lib/commerce/money'
import { splitOnSiteCharge } from '@/lib/commerce/product-money'
import {
  type BillableSubscription,
  type BillingInterval,
  applyChargeOutcome,
  dueSubscriptions,
  isBillingInterval,
} from '@/lib/commerce/recurring'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getPaymentProvider } from '@/lib/payments'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type PendingSubscriptionRow,
  pendingTable,
  selectPending,
} from '@/lib/supabase/pending-schema'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Charges the subscriptions whose cycle has come due.
 *
 * The decisions are NOT made here. Which rows are due, and what a success or a
 * failure means for the schedule, are `dueSubscriptions` and
 * `applyChargeOutcome` in src/lib/commerce/recurring.ts - pure, clock-free, and
 * covered by tests that do not need a database. This route is the part that
 * cannot be pure: it reads, calls Cardcom, and writes back.
 *
 * DOUBLE-CHARGE DEFENCE, in order of what actually stops it:
 *
 *   1. The unique index `subscription_charges_one_per_cycle` on
 *      (subscription_id, period_key) WHERE status = 'succeeded'. A cycle can be
 *      ATTEMPTED many times but can only ever SUCCEED once. This is the real
 *      guarantee, and it holds even if two runs overlap or a third caller
 *      appears, because it is enforced by the database rather than by this file.
 *   2. The charge row is inserted BEFORE the subscription is advanced. If the
 *      process dies between the two, the next run sees the succeeded charge for
 *      that period and skips it rather than billing again.
 *   3. `period_key` is the cycle being paid for, never `now()`. Two runs on the
 *      same cycle produce the same key; a run that fires twice in one minute
 *      does not produce two keys.
 *
 * WHAT THIS ROUTE DELIBERATELY DOES NOT DO:
 *
 *   It does not cancel anything. Three declines exhaust the retries and leave
 *   the subscription `past_due` for a human to resolve - see MAX_CHARGE_ATTEMPTS.
 *   Auto-cancelling a paying customer over an expired card is a business
 *   decision, and it is not one a cron job gets to make.
 *
 *   It does not move money into the wallet or create an order. A cycle charge
 *   is a payment against a token, and the supplier's share is recorded on the
 *   charge row for settlement to read. Building orders per cycle would create a
 *   second, competing definition of what an order is.
 *
 * PENDING-109 IS NOT APPLIED. Until it is, `subscriptions` does not exist and
 * this route reports `{ ok: true, skipped: 'not_migrated' }` rather than
 * failing: a cron that 500s every ten minutes on a feature nobody has enabled
 * is noise that trains the alerting to be ignored.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** Never bill more than this in one run, so a backlog drains over runs. */
const BATCH_LIMIT = 100

interface DueRow extends BillableSubscription {
  product_id: string
  billing_interval: string
  billing_interval_count: number
  platform_percent: number
  payment_token_id: string | null
  cardcom_account_id: string | null
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const nowIso = new Date().toISOString()
  const admin = createAdminClient()

  // The token lives on payment_tokens, so it is joined rather than duplicated
  // onto the subscription: one card, one row, and a re-tokenised card does not
  // leave a stale copy behind on every subscription that used it.
  const read = await selectPending<PendingSubscriptionRow & Record<string, unknown>>(() =>
    admin
      .from(pendingTable('subscriptions'))
      .select(
        'id, product_id, status, amount_agorot, platform_percent, billing_interval, billing_interval_count, next_charge_at, last_charge_at, failed_attempts, payment_token_id, payment_tokens(cardcom_token, cardcom_account_id)',
      )
      .in('status', ['active', 'past_due'])
      .not('next_charge_at', 'is', null)
      .lte('next_charge_at', nowIso)
      .order('next_charge_at', { ascending: true })
      .limit(BATCH_LIMIT * 2),
  )

  if (!read.ok) {
    if (read.missing) {
      log.info('subscriptions.cron.not_migrated', { reason: 'PENDING-109 not applied' })
      return NextResponse.json({ ok: true, skipped: 'not_migrated', charged: 0, failed: 0 })
    }
    log.error('subscriptions.cron.read_failed', { reason: read.message })
    return NextResponse.json({ ok: false, error: read.message }, { status: 500 })
  }

  // Flatten the joined token onto the row, then let the pure selector decide.
  // The SQL filter above and dueSubscriptions overlap on purpose: the query
  // keeps the result set small, and the pure function is what the tests cover.
  const candidates: DueRow[] = read.rows.map((row) => {
    const token = (
      row as { payment_tokens?: { cardcom_token?: string; cardcom_account_id?: string } | null }
    ).payment_tokens
    return {
      id: row.id,
      status: row.status as BillableSubscription['status'],
      next_charge_at: row.next_charge_at,
      failed_attempts: row.failed_attempts ?? 0,
      amount_agorot: row.amount_agorot,
      cardcom_token: token?.cardcom_token ?? null,
      product_id: row.product_id,
      billing_interval: row.billing_interval,
      billing_interval_count: row.billing_interval_count ?? 1,
      platform_percent: row.platform_percent,
      payment_token_id: row.payment_token_id,
      cardcom_account_id: token?.cardcom_account_id ?? null,
    }
  })

  const due = dueSubscriptions(candidates, nowIso, BATCH_LIMIT)

  let charged = 0
  let failed = 0

  for (const subscription of due) {
    const interval: BillingInterval = isBillingInterval(subscription.billing_interval)
      ? subscription.billing_interval
      : 'monthly'

    // The cycle being paid for. Not now(): see the double-charge notes above.
    const periodKey = subscription.next_charge_at as string

    const amount = agorot(subscription.amount_agorot)
    const split = splitOnSiteCharge(amount, subscription.platform_percent)

    let outcome: {
      success: boolean
      transactionId: string | null
      code: string | null
      message: string | null
    }

    try {
      const provider = getPaymentProvider(subscription.cardcom_account_id)
      const result = await provider.chargeWithToken({
        paymentId: `${subscription.id}:${periodKey}`,
        orderId: subscription.id,
        amountAgorot: amount,
        cardcomToken: subscription.cardcom_token as string,
        description: `חיוב תקופתי · ${subscription.id.slice(0, 8)}`,
      })
      outcome = {
        success: result.success,
        transactionId: result.transactionId,
        code: result.failureCode,
        message: result.failureMessage,
      }
    } catch (error) {
      // A thrown provider call is a FAILED charge, not a crashed run. Letting it
      // escape would abandon every subscription after this one in the batch.
      //
      // Which is also why it has to be reported from inside the catch. The run
      // goes on to answer 200 with a tally, so neither the 5xx reporting in
      // `withRequestLog` nor `onRequestError` will ever see this: a terminal
      // that has stopped answering looks, from the outside, like a batch of
      // subscriptions that all declined. `capturePaymentError` rather than the
      // alarm variant on purpose - a declined card is normal, and a phone that
      // buzzes per failed renewal is a phone nobody reads.
      capturePaymentError(error, {
        stage: 'subscription_charge',
        detail: { subscription_id: subscription.id, period_key: periodKey },
      })
      outcome = {
        success: false,
        transactionId: null,
        code: 'exception',
        message: error instanceof Error ? error.message : 'provider threw',
      }
    }

    // The charge row goes in FIRST, so a crash before the advance cannot cause
    // a second charge for the same cycle.
    const { error: chargeError } = await admin.from(pendingTable('subscription_charges')).insert({
      subscription_id: subscription.id,
      period_key: periodKey,
      status: outcome.success ? 'succeeded' : 'failed',
      amount_agorot: amount,
      platform_fee_agorot: split.platformFee,
      supplier_due_agorot: split.supplierDue,
      cardcom_transaction_id: outcome.transactionId,
      failure_code: outcome.code,
      failure_message: outcome.message?.slice(0, 500) ?? null,
    } as never)

    if (chargeError) {
      // A unique violation means another run already recorded a success for this
      // cycle. The money was taken once and this run must not advance the
      // schedule a second time on top of it.
      if (chargeError.code === '23505') {
        log.warn('subscriptions.cron.duplicate_cycle', {
          subscriptionId: subscription.id,
          periodKey,
        })
        continue
      }
      log.error('subscriptions.cron.charge_row_failed', {
        subscriptionId: subscription.id,
        reason: chargeError.message,
      })
      continue
    }

    const update = applyChargeOutcome(subscription, outcome, {
      nowIso,
      interval,
      intervalCount: subscription.billing_interval_count,
    })

    const { error: updateError } = await admin
      .from(pendingTable('subscriptions'))
      .update({
        status: update.status,
        next_charge_at: update.next_charge_at,
        failed_attempts: update.failed_attempts,
        ...(update.last_charge_at ? { last_charge_at: update.last_charge_at } : {}),
      } as never)
      .eq('id', subscription.id)

    if (updateError) {
      log.error('subscriptions.cron.advance_failed', {
        subscriptionId: subscription.id,
        reason: updateError.message,
      })
    }

    if (outcome.success) charged += 1
    else failed += 1
  }

  log.info('subscriptions.cron.done', { due: due.length, charged, failed })
  return NextResponse.json({ ok: true, due: due.length, charged, failed })
}

export const GET = withRequestLog('/api/cron/subscriptions', handleGET)
