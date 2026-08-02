import { timingSafeEqual } from 'node:crypto'
import { cardcomWebhookPayloadSchema, isCardcomSuccess } from '@/lib/contracts/webhooks'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'

/** Constant-time string compare; false on any length/format mismatch. */
function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

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
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const env = loadCardcomEnv()
  const admin = createAdminClient()

  const secretOk = secretMatches(request.nextUrl.searchParams.get('s') ?? '', env.webhookSecret)

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
    // duplicate => replay; anything else we still answer 200 and rely on reconcile
    return NextResponse.json({ ok: true, replay: true })
  }

  if (!secretOk || !parsed.success) {
    return NextResponse.json({ ok: true })
  }
  const payload = parsed.data

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
  const { data: paymentRow } = await admin
    .from('payments')
    .select(paymentSelect)
    .eq('cardcom_low_profile_id', payload.lowprofilecode)
    .maybeSingle()
  const payment = paymentRow as unknown as {
    id: string
    order_id: string
    status: string
    cardcom_account_id: string | null
  } | null
  if (!payment) {
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
    return NextResponse.json({ ok: true })
  }

  // 3. Server-to-server re-verify; trust only this response. The account comes
  //    from the stored payment, not from the callback: a Low Profile id only
  //    resolves on the terminal that created it, so asking any other one would
  //    answer not_found for a customer who was charged.
  const provider = getPaymentProvider(payment.cardcom_account_id)
  const verified = await provider.verifyLowProfile(payload.lowprofilecode)
  if (!verified.success || verified.amountAgorot === null) {
    // Cardcom said the deal succeeded and the re-verify disagrees. Someone is
    // wrong about whether the customer was charged, and it is not resolvable
    // from here.
    capturePaymentAlarm('cardcom webhook reported success but GetLpResult did not', {
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
    capturePaymentAlarm('payment row carries no readable amount', {
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
    capturePaymentAlarm('cardcom charged an amount we did not ask for', {
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

  // 4. The single valuable transition
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
    capturePaymentAlarm('payment verified but finalize failed', {
      stage: 'cardcom_webhook_finalize',
      orderId: payment.order_id,
      paymentId: payment.id,
      detail: { error: result.error, code: result.code },
    })
    return NextResponse.json({ ok: false })
  }

  await admin
    .from('payment_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', 'cardcom')
    .eq('external_event_id', externalEventId)

  return NextResponse.json({ ok: true })
}
