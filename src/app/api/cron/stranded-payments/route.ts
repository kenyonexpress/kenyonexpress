import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The customer who paid and whose webhook never arrived.
 *
 * WHAT IS ALREADY COVERED, so this is not a fourth copy of it:
 *
 *   - the webhook itself, when Cardcom delivers it;
 *   - `reconcileOrderReturn`, when the shopper's browser lands on
 *     `/checkout/return` - but only if it does, and a tab closed on the
 *     provider's redirect never does;
 *   - the DAILY terminal reconciliation, which finds money with no row at all.
 *
 * The hole between them is the ordinary one: the browser went away AND the
 * callback was lost. The order sits `pending`, the payment sits `redirected`,
 * the customer's card is charged, and nothing looks at it until tomorrow. This
 * closes that to ten minutes.
 *
 * IT ASKS THE PROVIDER RATHER THAN ASSUMING. Every candidate is re-verified
 * with `GetLpResult`, which is the same single source of truth the webhook and
 * the return page both use. A payment this job cannot verify is left exactly as
 * it was; nothing here decides that money moved.
 *
 * THE WINDOW HAS A FLOOR AND A CEILING, and both matter. Younger than three
 * minutes is a shopper still typing their card number on Cardcom's page, and
 * finalizing under them would be a race with the webhook for no gain. Older
 * than 24 hours is not a stranded payment any more, it is an abandoned
 * checkout, and re-verifying thousands of them nightly would be a Cardcom bill
 * for nothing.
 *
 * FINALIZE IS IDEMPOTENT, which is what makes this safe to run every ten
 * minutes: a payment the webhook settles a second after this job picked it up
 * is finalized once, by whichever arrives first.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** Below this, the shopper is probably still on the hosted page. */
const MIN_AGE_MINUTES = 3
/** Above this it is an abandoned checkout, not a stranded payment. */
const MAX_AGE_HOURS = 24
/** One run's ceiling. A backlog drains over consecutive runs. */
const BATCH = 25

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  // No credentials is not a failure of this job, the same distinction the
  // invoice queue and the notification outbox draw.
  if (!loadCardcomEnv().checkoutEnabled) {
    return NextResponse.json({ ok: true, skipped: 'provider_unconfigured' })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const newest = new Date(now - MIN_AGE_MINUTES * 60_000).toISOString()
  const oldest = new Date(now - MAX_AGE_HOURS * 60 * 60_000).toISOString()

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
      `id, order_id, status, cardcom_low_profile_id, cardcom_account_id, ${money.amountColumn}`,
    )
    // `redirected` only. `initiated` never reached a hosted page, and there is
    // no Low Profile id to ask about.
    .eq('status', 'redirected')
    .not('cardcom_low_profile_id', 'is', null)
    .lte('created_at', newest)
    .gte('created_at', oldest)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    log.error('stranded.read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const payments = (rows ?? []) as unknown as (Record<string, unknown> & {
    id: string
    order_id: string
    cardcom_low_profile_id: string
    cardcom_account_id: string | null
  })[]

  let rescued = 0
  let stillOpen = 0
  let failed = 0

  for (const payment of payments) {
    let verified: Awaited<ReturnType<ReturnType<typeof getPaymentProvider>['verifyLowProfile']>>
    try {
      verified = await getPaymentProvider(payment.cardcom_account_id).verifyLowProfile(
        payment.cardcom_low_profile_id,
      )
    } catch (verifyError) {
      // Unreachable provider is not a verdict. The row is left exactly as it
      // was and the next run asks again.
      log.warn('stranded.verify_failed', {
        paymentId: payment.id,
        reason: verifyError instanceof Error ? verifyError.message : 'unknown',
      })
      failed++
      continue
    }

    if (!verified.success || verified.amountAgorot === null) {
      // The provider says this deal did not succeed. That is the ordinary
      // abandoned checkout, and it is not touched: marking it `failed` here
      // would race a shopper who is still on a 3-D Secure step.
      stillOpen++
      continue
    }

    const expectedAgorot = readAmountAgorot(money, payment)
    if (expectedAgorot !== null && verified.amountAgorot !== expectedAgorot) {
      // Money moved for an amount that is not what we recorded. Not finalized,
      // and loud: this is the same class of disagreement the webhook alarms on.
      await capturePaymentAlarm('stranded payment verified at a different amount', {
        stage: 'stranded_amount_mismatch',
        orderId: payment.order_id,
        paymentId: payment.id,
        detail: { verified: verified.amountAgorot, expected: expectedAgorot },
      })
      failed++
      continue
    }

    const result = await finalizeOrder({
      orderId: payment.order_id,
      paymentId: payment.id,
      transactionId: verified.transactionId ?? null,
      now: new Date(),
    })

    if (result.ok) {
      rescued++
      // Worth an alarm even on success. A payment reaching this job at all
      // means a callback was lost, and a rising count is a Cardcom delivery
      // problem that no other signal reports.
      log.error('stranded.rescued', {
        paymentId: payment.id,
        orderId: payment.order_id,
        replay: result.replay,
      })
    } else {
      failed++
      await capturePaymentAlarm('stranded payment verified but could not be finalized', {
        stage: 'stranded_finalize',
        orderId: payment.order_id,
        paymentId: payment.id,
        detail: { code: result.code, error: result.error },
      })
    }
  }

  return NextResponse.json({ ok: true, considered: payments.length, rescued, stillOpen, failed })
}

export const GET = withRequestLog('/api/cron/stranded-payments', handleGET)
