import { createAdminClient } from '@/lib/supabase/admin'
import type { OrderLifecycleStatus } from '@/server/domain/orders/lifecycle'
import { toLegacyOrderStatus } from '@/server/domain/orders/lifecycle'
import { planStripePaymentSucceeded } from '@/server/payments/stripe-finalize'

export type ApplyStripeFinalizeResult =
  | { ok: true; replay: boolean; orderId: string; status: OrderLifecycleStatus }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'STATE_INVALID' | 'INTERNAL' }

/**
 * Idempotent finalize for Stripe payment_intent.succeeded.
 * Uses service-role client; never call from the browser.
 */
export async function applyStripePaymentSucceeded(input: {
  orderId: string
  providerEventId: string
  providerPaymentId: string
  paymentAttemptId?: string | null
}): Promise<ApplyStripeFinalizeResult> {
  const admin = createAdminClient()

  const { data: order, error } = await admin
    .from('orders')
    .select('id, status')
    .eq('id', input.orderId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, error: error.message, code: 'INTERNAL' }
  if (!order) return { ok: false, error: 'order not found', code: 'NOT_FOUND' }

  const fromStatus = normalizeLifecycle(order.status)
  const planned = planStripePaymentSucceeded({
    orderId: order.id,
    fromStatus,
    providerEventId: input.providerEventId,
    providerPaymentId: input.providerPaymentId,
  })

  if (planned.kind === 'replay') {
    return { ok: true, replay: true, orderId: planned.orderId, status: planned.status }
  }

  const nowIso = new Date().toISOString()
  const { error: updateError } = await admin
    .from('orders')
    .update({
      status: toLegacyOrderStatus(planned.plan.to),
      paid_at: nowIso,
      stripe_payment_intent_id: planned.stripePaymentIntentId,
    })
    .eq('id', order.id)
    .eq('status', 'pending')

  if (updateError) return { ok: false, error: updateError.message, code: 'INTERNAL' }

  const { error: auditError } = await admin.from('order_status_audit').insert({
    order_id: order.id,
    from_status: planned.plan.audit.from_status,
    to_status: planned.plan.audit.to_status,
    event: planned.plan.audit.event,
    actor: planned.plan.audit.actor,
    provider_event_id: planned.plan.audit.provider_event_id,
    payload: planned.plan.audit.payload,
  })
  if (auditError) return { ok: false, error: auditError.message, code: 'INTERNAL' }

  if (input.paymentAttemptId) {
    await admin
      .from('payment_attempts')
      .update({
        status: 'succeeded',
        provider_payment_id: input.providerPaymentId,
      })
      .eq('id', input.paymentAttemptId)
  } else {
    await admin
      .from('payment_attempts')
      .update({ status: 'succeeded', provider_payment_id: input.providerPaymentId })
      .eq('provider_payment_id', input.providerPaymentId)
  }

  return { ok: true, replay: false, orderId: order.id, status: planned.plan.to }
}

function normalizeLifecycle(status: string): OrderLifecycleStatus {
  switch (status) {
    case 'pending':
    case 'paid':
    case 'fulfilled':
    case 'refunded':
    case 'cancelled':
      return status
    case 'partially_fulfilled':
      return 'paid'
    default:
      return 'pending'
  }
}
