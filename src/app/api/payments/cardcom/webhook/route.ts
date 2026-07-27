import { timingSafeEqual } from 'node:crypto'
import { cardcomWebhookPayloadSchema, isCardcomSuccess } from '@/lib/contracts/webhooks'
import {
  WEBHOOK_SIGNATURE_HEADER,
  loadCardcomEnv,
  resolveAccountByTerminal,
  verifyWebhookSignature,
} from '@/lib/payments'
import { enqueueWebhookRetry } from '@/lib/queue/webhook-retry'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendPaymentEvent } from '@/server/payments/events'
import { isRetriable, processCardcomLowProfile } from '@/server/payments/webhook-processing'
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
 * Cardcom webhook (IndicatorUrl), multi-account.
 *
 * Authenticity gates, in order of strength:
 * 1. HMAC-SHA256 signature header (x-ke-webhook-signature) over the raw body,
 *    keyed by the webhook secret of the account whose terminal number the
 *    payload names. Real Cardcom does not sign, so this gate serves our own
 *    signed callers (retry driver, E2E simulator, future signing proxy).
 * 2. Legacy: unguessable shared secret in the callback URL (`?s=`), set when
 *    creating the Low Profile page. Accepted against the resolved account's
 *    secret or the platform secret.
 * Either gate admits the request; the POST body is NEVER trusted for money:
 * processing re-verifies via GetLpResult on the account that charged, and the
 * re-fetched result is the only source of amount / status / token.
 *
 * Always: log the event first, dedup on (provider, external_event_id), answer
 * 200 (Cardcom re-posts on non-200; our own retry queue owns retries).
 * A verified event that fails processing is parked on the Upstash retry queue.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const env = loadCardcomEnv()
  const admin = createAdminClient()

  let payloadJson: Json
  try {
    payloadJson = JSON.parse(rawBody) as Json
  } catch {
    payloadJson = { raw: rawBody }
  }

  const parsed = cardcomWebhookPayloadSchema.safeParse(payloadJson)

  // Resolve the claimed account for signature verification. Unknown terminals
  // resolve to the platform account, so single-terminal setups keep working.
  const account = await resolveAccountByTerminal(
    admin,
    parsed.success ? parsed.data.terminalnumber : null,
  )

  const signatureOk = verifyWebhookSignature(
    rawBody,
    account.webhookSecret,
    request.headers.get(WEBHOOK_SIGNATURE_HEADER),
  )
  const urlSecret = request.nextUrl.searchParams.get('s') ?? ''
  const urlSecretOk =
    secretMatches(urlSecret, account.webhookSecret) || secretMatches(urlSecret, env.webhookSecret)
  const authOk = signatureOk || urlSecretOk

  const externalEventId = parsed.success
    ? `${parsed.data.lowprofilecode}:${parsed.data.InternalDealNumber ?? 'na'}`
    : `unparsed:${rawBody.slice(0, 64)}`

  // 1. Persist first (dedup on replay)
  const { error: eventError } = await admin.from('payment_webhook_events').insert({
    provider: 'cardcom',
    external_event_id: externalEventId,
    signature_valid: authOk,
    verified_against_api: false,
    payload: payloadJson,
  })
  if (eventError) {
    // duplicate => replay; anything else we still answer 200 and rely on reconcile
    return NextResponse.json({ ok: true, replay: true })
  }

  if (!authOk || !parsed.success) {
    return NextResponse.json({ ok: true })
  }
  const payload = parsed.data

  // 2. Locate our payment by the hosted-page id
  const { data: payment } = await admin
    .from('payments')
    .select('id, order_id, status')
    .eq('cardcom_low_profile_id', payload.lowprofilecode)
    .maybeSingle()
  if (!payment) {
    return NextResponse.json({ ok: true, unknown_payment: true })
  }

  await appendPaymentEvent(admin, {
    orderId: payment.order_id,
    paymentId: payment.id,
    eventType: 'webhook_received',
    actor: signatureOk ? 'webhook:signed' : 'webhook:url-secret',
    idempotencyKey: `webhook:${externalEventId}`,
    metadata: { account_key: account.key, response_code: payload.ResponseCode },
  })

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
    await appendPaymentEvent(admin, {
      orderId: payment.order_id,
      paymentId: payment.id,
      eventType: 'payment_failed',
      toState: 'failed',
      idempotencyKey: `payment:${payment.id}:failed`,
      metadata: { failure_code: String(payload.ResponseCode) },
    })
    return NextResponse.json({ ok: true })
  }

  // 3+4. Re-verify on the charging account and finalize (shared with retries)
  const result = await processCardcomLowProfile(payload.lowprofilecode, 'webhook')

  if (result.status === 'finalized') {
    await admin
      .from('payment_webhook_events')
      .update({
        verified_against_api: true,
        payment_id: payment.id,
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'cardcom')
      .eq('external_event_id', externalEventId)
    return NextResponse.json({ ok: true })
  }

  if (isRetriable(result)) {
    await enqueueWebhookRetry({
      provider: 'cardcom',
      lowProfileId: payload.lowprofilecode,
      externalEventId,
      attempt: 1,
    })
    await appendPaymentEvent(admin, {
      orderId: payment.order_id,
      paymentId: payment.id,
      eventType: 'webhook_retry_enqueued',
      idempotencyKey: `webhook:${externalEventId}:retry:1`,
      metadata: { reason: result.status },
    })
    return NextResponse.json({ ok: true, queued: true })
  }

  return NextResponse.json({ ok: true, result: result.status })
}
