import { getCheckoutPaymentProvider } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyStripePaymentSucceeded } from '@/server/payments/apply-stripe-finalize'

export async function handleStripeWebhookRequest(
  rawBody: string,
  headers: Headers,
): Promise<Response> {
  const provider = getCheckoutPaymentProvider()

  let event: Awaited<ReturnType<typeof provider.parseAndVerifyWebhook>>
  try {
    event = await provider.parseAndVerifyWebhook(rawBody, headers)
  } catch {
    return new Response('invalid signature', { status: 400 })
  }

  const admin = createAdminClient()

  // Durable dedupe: unique (provider, external_event_id)
  const { error: insertError } = await admin.from('payment_webhook_events').insert({
    provider: provider.kind,
    external_event_id: event.providerEventId,
    event_type: event.type,
    payload: event.raw,
    signature_valid: true,
  })

  if (insertError) {
    // Unique violation => replay
    if (insertError.code === '23505' || insertError.message.toLowerCase().includes('duplicate')) {
      return Response.json({ ok: true, replay: true })
    }
    return new Response(insertError.message, { status: 500 })
  }

  if (event.type === 'payment_intent.succeeded') {
    if (!event.orderId || !event.providerPaymentId) {
      return Response.json({ ok: true, skipped: 'missing_order_metadata' })
    }

    const result = await applyStripePaymentSucceeded({
      orderId: event.orderId,
      providerEventId: event.providerEventId,
      providerPaymentId: event.providerPaymentId,
      paymentAttemptId: event.paymentAttemptId,
    })

    await admin
      .from('payment_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', provider.kind)
      .eq('external_event_id', event.providerEventId)

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 500 })
    }
    return Response.json({ ok: true, replay: result.replay, order_id: result.orderId })
  }

  await admin
    .from('payment_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', provider.kind)
    .eq('external_event_id', event.providerEventId)

  return Response.json({ ok: true, ignored: event.type })
}
