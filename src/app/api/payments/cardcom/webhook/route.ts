import { timingSafeEqual } from 'node:crypto'
import { cardcomWebhookPayloadSchema, isCardcomSuccess } from '@/lib/contracts/webhooks'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeOrder } from '@/server/payments/finalize'
import type { Json } from '@/types/database'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

  // 2. Locate our payment by the hosted-page id
  const { data: payment } = await admin
    .from('payments')
    .select('id, order_id, status, amount_ils')
    .eq('cardcom_low_profile_id', payload.lowprofilecode)
    .maybeSingle()
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

  // 3. Server-to-server re-verify; trust only this response
  const provider = getPaymentProvider()
  const verified = await provider.verifyLowProfile(payload.lowprofilecode)
  if (!verified.success || verified.amountAgorot === null) {
    return NextResponse.json({ ok: true, verified: false })
  }

  const expectedAgorot = Math.round(Number(payment.amount_ils) * 100)
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
    return NextResponse.json({ ok: true, amount_mismatch: true })
  }

  await admin
    .from('payment_webhook_events')
    .update({
      verified_against_api: true,
      payment_id: payment.id,
      processed_at: new Date().toISOString(),
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

  return NextResponse.json({ ok: result.ok })
}
