import type { Json } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Append-only journal of the checkout state machine (public.payment_events,
 * migration 070). Every meaningful transition writes one event; corrections
 * are new events, never edits (DB triggers enforce this even for the service
 * role).
 *
 * The union below is the vocabulary the flow emits today. The column is text
 * on purpose: old events must stay readable after the vocabulary grows.
 */
export type PaymentEventType =
  | 'checkout_started'
  | 'payment_initiated'
  | 'payment_redirected'
  | 'webhook_received'
  | 'webhook_rejected'
  | 'payment_verified'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'order_paid'
  | 'order_cancelled'
  | 'escrow_held'
  | 'escrow_released'
  | 'escrow_refunded'
  | 'split_executed'
  | 'platform_settled'
  | 'platform_fee_recorded'
  | 'refund_executed'
  | 'webhook_retry_enqueued'
  | 'webhook_retry_processed'

type AdminLike = Pick<SupabaseClient, 'from'>

export type PaymentEventInput = {
  orderId: string
  orderItemId?: string | null
  paymentId?: string | null
  eventType: PaymentEventType
  fromState?: string | null
  toState?: string | null
  amountAgorot?: number | null
  actor?: string
  /** Unique per logical event; a replay with the same key is a silent no-op. */
  idempotencyKey?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Appends one event. Returns false only on a real write failure (duplicate
 * idempotency key counts as success: the event is already journaled). Callers
 * on money paths treat false as an error; observability-only callers may
 * ignore it.
 */
export async function appendPaymentEvent(
  admin: AdminLike,
  input: PaymentEventInput,
): Promise<boolean> {
  const { error } = await admin.from('payment_events').insert({
    order_id: input.orderId,
    order_item_id: input.orderItemId ?? null,
    payment_id: input.paymentId ?? null,
    event_type: input.eventType,
    from_state: input.fromState ?? null,
    to_state: input.toState ?? null,
    amount_agorot: input.amountAgorot ?? null,
    actor: input.actor ?? 'system',
    idempotency_key: input.idempotencyKey ?? null,
    metadata: (input.metadata ?? {}) as Json,
  })
  if (!error) return true
  if (error.message.includes('duplicate')) return true
  console.error(`payment_events append failed (${input.eventType}): ${error.message}`)
  return false
}
