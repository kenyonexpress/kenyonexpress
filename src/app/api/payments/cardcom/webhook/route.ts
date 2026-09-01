import { cardcomWebhookPayloadSchema, isCardcomSuccess } from '@/lib/contracts/webhooks'
import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { acceptedWebhookSecrets } from '@/lib/payments/env'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { secretEquals } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import { recordPaymentEvent } from '@/server/payments/payment-events'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * True when the callback presents the current secret OR the one being retired.
 *
 * Both are checked, always — no short circuit on the first match. Bailing early
 * would make the response time say which secret was presented, and the whole
 * point of `timingSafeEqual` above is that this comparison leaks nothing.
 */
function anySecretMatches(provided: string, accepted: readonly string[]): boolean {
  let matched = false
  for (const secret of accepted) {
    if (secretEquals(provided, secret)) matched = true
  }
  return matched
}

/** Postgres: unique_violation. The only insert failure here that means "replay". */
const UNIQUE_VIOLATION = '23505'

/**
 * Cardcom webhook (IndicatorUrl). Cardcom does NOT sign its callbacks — there is
 * no HMAC or signature header to verify. Authenticity therefore rests on two
 * things, never on the POST body:
 * 1. An unguessable shared secret carried in the callback URL (`?s=`), which we
 *    set when creating the Low Profile page.
 * 2. Mandatory server-to-server re-verification via GetLpResult — the re-fetched
 *    result is the ONLY trusted source of amount / status / token.
 * Plus: log every event first, dedup on (provider, external_event_id), replays
 * are 200 no-ops.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const env = loadCardcomEnv()
  const admin = createAdminClient()

  const secretOk = anySecretMatches(
    request.nextUrl.searchParams.get('s') ?? '',
    acceptedWebhookSecrets(env),
  )

  let payloadJson: Json
  try {
    payloadJson = JSON.parse(rawBody) as Json
  } catch {
    payloadJson = { raw: rawBody }
  }

  const parsed = cardcomWebhookPayloadSchema.safeParse(payloadJson)
  const externalEventId = parsed.success
    ? `${parsed.data.lowprofilecode}:${parsed.data.InternalDealNumber ?? 'na'}`
    : `unparsed:${rawBody.slice(0, 64)}`

  // 1. Persist first (dedup on replay)
  const { error: eventError } = await admin.from('payment_webhook_events').insert({
    provider: 'cardcom',
    external_event_id: externalEventId,
    signature_valid: secretOk,
    verified_against_api: false,
    payload: payloadJson,
  })
  if (eventError) {
    // A UNIQUE violation is the dedup working: Cardcom delivered this event
    // twice, the second one is a no-op, and 200 is the right answer.
    //
    // ANYTHING ELSE IS NOT A REPLAY, and this used to say it was. A connection
    // reset, a changed policy, a full disk — every one of them answered
    // `{ok:true, replay:true}` with a 200, which tells Cardcom the callback was
    // received and stops it retrying. The card is charged, GetLpResult is never
    // called, the order stays open, and the row that `webhook-dlq.ts` replays
    // was never written, so nothing knows. A 5xx here is the whole recovery
    // mechanism: Cardcom retries it.
    if (eventError.code === UNIQUE_VIOLATION) {
      await recordPaymentEvent({
        eventType: 'callback_replay',
        stage: 'cardcom_webhook_persist',
        externalEventId,
        lowProfileId: parsed.success ? parsed.data.lowprofilecode : null,
      })
      return NextResponse.json({ ok: true, replay: true })
    }
    await capturePaymentAlarm('cardcom webhook could not be journalled', {
      stage: 'cardcom_webhook_persist',
      detail: { code: eventError.code, reason: eventError.message },
    })
    return NextResponse.json({ ok: false, error: 'event_not_recorded' }, { status: 503 })
  }

  if (!secretOk) {
    // Two very different things arrive here, and only one is worth waking
    // somebody for.
    //
    // A body that does NOT parse as a Cardcom callback is a scanner. The row is
    // already written with `signature_valid: false`, which is the record, and a
    // 200 tells it nothing about whether the secret was close.
    //
    // A body that DOES parse is Cardcom itself, calling with a secret this
    // deployment does not accept. That is a misconfiguration — a rotation done
    // on one side only — and it is invisible in every other way: the endpoint
    // answers 200, Cardcom is satisfied, and EVERY paid order silently stays
    // open. It is also exactly what the two-secret window exists to prevent, so
    // it must be loud enough that the window is noticed while it is open.
    if (parsed.success) {
      await recordPaymentEvent({
        eventType: 'callback_rejected',
        stage: 'cardcom_webhook_secret',
        externalEventId,
        lowProfileId: parsed.data.lowprofilecode,
        detail: { accepted_secrets: acceptedWebhookSecrets(env).length },
      })
      await capturePaymentAlarm('cardcom callback rejected: no accepted secret matched', {
        stage: 'cardcom_webhook_secret',
        detail: {
          low_profile_id: parsed.data.lowprofilecode,
          accepted_secrets: acceptedWebhookSecrets(env).length,
        },
      })
    } else {
      log.warn('cardcom.webhook_unauthenticated', { parsed: false })
    }
    return NextResponse.json({ ok: true })
  }

  if (!parsed.success) {
    return NextResponse.json({ ok: true })
  }
  const payload = parsed.data

  // The callback is authenticated, parsed and journalled. Everything after this
  // point is our own finding rather than the provider's statement.
  await recordPaymentEvent({
    eventType: 'callback_received',
    stage: 'cardcom_webhook_persist',
    externalEventId,
    lowProfileId: payload.lowprofilecode,
    transactionId: payload.InternalDealNumber ? String(payload.InternalDealNumber) : null,
    detail: { succeeded_at_provider: isCardcomSuccess(payload) },
  })

  // 2. Locate our payment by the hosted-page id.
  //
  //    The money column is resolved rather than named. This database is pre-059
  //    and carries `amount_ils`; naming `amount_agorot` raised 42703, which
  //    fails the whole select, so `payment` came back null and this route
  //    answered `{ok:true, unknown_payment:true}` with a 200 for a customer
  //    Cardcom had just charged. See lib/payments/payment-money-columns.ts.
  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )
  // The select string is built at runtime, so the client cannot infer the row
  // shape from it; the cast is what that costs and is confined to this line.
  const paymentSelect = `id, order_id, status, ${money.amountColumn}, cardcom_account_id`
  const { data: paymentRow, error: paymentReadError } = await admin
    .from('payments')
    .select(paymentSelect)
    .eq('cardcom_low_profile_id', payload.lowprofilecode)
    .maybeSingle()
  if (paymentReadError) {
    // A READ THAT FAILED IS NOT A PAYMENT WE DO NOT HAVE, and the two answers
    // below are both wrong for it. Discarded, the error fell into the branch
    // underneath: it raised the "a customer may have been charged and has no
    // order" alarm - the most expensive thing this route can report, here
    // untrue - and answered 200, which tells Cardcom the event is handled and
    // stops the retries for a payment we DO hold.
    //
    // 5xx is the correct answer to this one specific case, for the same reason
    // the branch below says 200 is correct to its own: retrying can place this
    // event, and retrying an unknown payment cannot. The 10-minute
    // stranded-payments job is the floor under both, not the plan.
    log.error('cardcom.webhook_payment_read_failed', {
      low_profile_id: payload.lowprofilecode,
      reason: paymentReadError.message,
    })
    return NextResponse.json({ ok: false, retry: true }, { status: 503 })
  }
  const payment = paymentRow as unknown as {
    id: string
    order_id: string
    status: string
    cardcom_account_id: string | null
  } | null
  if (!payment) {
    // A callback for a Low Profile id we hold no payment for.
    //
    // THIS USED TO BE SILENT, and it is the single most expensive thing this
    // route can see: Cardcom is telling us about a hosted page WE created and
    // whose payment row is not here. Either the row was never written - the
    // request died between `createLowProfile` returning and our insert
    // committing - or it was written against a different deployment. In both
    // cases a customer may have been charged and has no order, and nobody will
    // ever open a support ticket about it, because there is no order number to
    // cite. It is the same `missing_locally` case the daily terminal
    // reconciliation exists to catch, arriving here HOURS earlier.
    //
    // Still a 200: there is nothing Cardcom can do by retrying, and a 5xx would
    // make it retry an event we will keep failing to place.
    await recordPaymentEvent({
      eventType: 'callback_unknown_payment',
      stage: 'cardcom_webhook_unknown_payment',
      externalEventId,
      lowProfileId: payload.lowprofilecode,
      detail: { succeeded_at_provider: isCardcomSuccess(payload) },
    })
    await capturePaymentAlarm('cardcom callback for a payment that does not exist here', {
      stage: 'cardcom_webhook_unknown_payment',
      detail: {
        low_profile_id: payload.lowprofilecode,
        deal_number: payload.InternalDealNumber ?? null,
        succeeded_at_provider: isCardcomSuccess(payload),
      },
    })
    return NextResponse.json({ ok: true, unknown_payment: true })
  }

  if (!isCardcomSuccess(payload)) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        failure_code: String(payload.ResponseCode),
        failed_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['initiated', 'redirected'])
    await recordPaymentEvent({
      eventType: 'callback_provider_failure',
      stage: 'cardcom_webhook_persist',
      externalEventId,
      orderId: payment.order_id,
      paymentId: payment.id,
      lowProfileId: payload.lowprofilecode,
      detail: { response_code: payload.ResponseCode },
    })
    return NextResponse.json({ ok: true })
  }

  // 3. Server-to-server re-verify; trust only this response. The account comes
  //    from the stored payment, not from the callback: a Low Profile id only
  //    resolves on the terminal that created it, so asking any other one would
  //    answer not_found for a customer who was charged.
  const provider = getPaymentProvider(payment.cardcom_account_id)
  await recordPaymentEvent({
    eventType: 'verify_requested',
    stage: 'cardcom_webhook_verify',
    externalEventId,
    orderId: payment.order_id,
    paymentId: payment.id,
    lowProfileId: payload.lowprofilecode,
  })
  const verified = await provider.verifyLowProfile(payload.lowprofilecode)
  if (!verified.success || verified.amountAgorot === null) {
    // Cardcom said the deal succeeded and the re-verify disagrees. Someone is
    // wrong about whether the customer was charged, and it is not resolvable
    // from here.
    await recordPaymentEvent({
      eventType: 'verify_contradicted_callback',
      stage: 'cardcom_webhook_verify',
      externalEventId,
      orderId: payment.order_id,
      paymentId: payment.id,
      lowProfileId: payload.lowprofilecode,
      detail: { verified_success: verified.success, amount_agorot: verified.amountAgorot },
    })
    await capturePaymentAlarm('cardcom webhook reported success but GetLpResult did not', {
      stage: 'cardcom_webhook_verify',
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { low_profile_id: payload.lowprofilecode },
    })
    return NextResponse.json({ ok: true, verified: false })
  }

  // Normalised to agorot from whichever column this database has. The history
  // here is worth keeping: this line has been "fixed" in both directions, once
  // by multiplying shekels by 100 and once by dropping the multiplication for a
  // column 059 was going to introduce and never did. Neither is a fix while the
  // schema is unknown, which is why the schema is now resolved rather than
  // assumed.
  const expectedAgorot = readAmountAgorot(money, payment as Record<string, unknown>)
  if (expectedAgorot === null) {
    await recordPaymentEvent({
      eventType: 'amount_unreadable',
      stage: 'cardcom_webhook_amount',
      externalEventId,
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { column: money.amountColumn },
    })
    await capturePaymentAlarm('payment row carries no readable amount', {
      stage: 'cardcom_webhook_amount',
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { column: money.amountColumn },
    })
    return NextResponse.json({ ok: true, amount_unreadable: true })
  }
  if (verified.amountAgorot !== expectedAgorot) {
    await admin.from('audit_log').insert({
      actor_id: null,
      actor_role: null,
      action: 'manual_override',
      entity_type: 'payment',
      entity_id: payment.id,
      changes: {} as Json,
      metadata: {
        alarm: 'cardcom_amount_mismatch',
        expected_agorot: expectedAgorot,
        got_agorot: verified.amountAgorot,
      } as unknown as Json,
    })
    await recordPaymentEvent({
      eventType: 'amount_mismatch',
      stage: 'cardcom_webhook_amount',
      externalEventId,
      orderId: payment.order_id,
      paymentId: payment.id,
      amountAgorot: verified.amountAgorot,
      detail: { expected_agorot: expectedAgorot, got_agorot: verified.amountAgorot },
    })
    await capturePaymentAlarm('cardcom charged an amount we did not ask for', {
      stage: 'cardcom_webhook_amount',
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { expected_agorot: expectedAgorot, got_agorot: verified.amountAgorot },
    })
    return NextResponse.json({ ok: true, amount_mismatch: true })
  }

  // Record what re-verification established, and NOTHING about the outcome.
  // `processed_at` deliberately stays null until the order actually closes:
  // it used to be stamped here, one statement before finalizeOrder, so the
  // event that most needs replaying (charged, verified, order still open, the
  // state the alarm below calls the worst in the system) was the one marked
  // handled. The dead letters were invisible by construction.
  await admin
    .from('payment_webhook_events')
    .update({
      verified_against_api: true,
      payment_id: payment.id,
    })
    .eq('provider', 'cardcom')
    .eq('external_event_id', externalEventId)

  await recordPaymentEvent({
    eventType: 'verify_succeeded',
    stage: 'cardcom_webhook_verify',
    externalEventId,
    orderId: payment.order_id,
    paymentId: payment.id,
    transactionId: verified.transactionId,
    amountAgorot: verified.amountAgorot,
  })

  // 4. The single valuable transition
  await recordPaymentEvent({
    eventType: 'finalize_started',
    stage: 'cardcom_webhook_finalize',
    externalEventId,
    orderId: payment.order_id,
    paymentId: payment.id,
    amountAgorot: verified.amountAgorot,
  })
  const result = await finalizeOrder({
    orderId: payment.order_id,
    paymentId: payment.id,
    transactionId: verified.transactionId,
    token: verified.token,
  })

  if (!result.ok) {
    // The card was charged and verified; the order did not close. This is the
    // single worst state in the system, so it alerts unconditionally. The row
    // keeps processed_at null, which is what puts it in the dead-letter queue
    // that `server/payments/webhook-dlq.ts` replays.
    await recordPaymentEvent({
      eventType: 'finalize_failed',
      stage: 'cardcom_webhook_finalize',
      externalEventId,
      orderId: payment.order_id,
      paymentId: payment.id,
      amountAgorot: verified.amountAgorot,
      detail: { error: result.error, code: result.code },
    })
    await capturePaymentAlarm('payment verified but finalize failed', {
      stage: 'cardcom_webhook_finalize',
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { error: result.error, code: result.code },
    })
    return NextResponse.json({ ok: false })
  }

  await recordPaymentEvent({
    eventType: 'finalize_succeeded',
    stage: 'cardcom_webhook_finalize',
    externalEventId,
    orderId: payment.order_id,
    paymentId: payment.id,
    amountAgorot: verified.amountAgorot,
    transactionId: verified.transactionId,
  })

  await admin
    .from('payment_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', 'cardcom')
    .eq('external_event_id', externalEventId)

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/payments/cardcom/webhook', handlePOST)
