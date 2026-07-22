import type { OrderLifecycleStatus } from '@/server/domain/orders/lifecycle'
import { type AuditActor, planLifecycleTransition } from '@/server/domain/orders/lifecycle-audit'

export type StripeFinalizeInput = {
  orderId: string
  fromStatus: OrderLifecycleStatus
  providerEventId: string
  providerPaymentId: string
  actor?: AuditActor
  payload?: Record<string, unknown>
}

export type StripeFinalizePlan =
  | { kind: 'replay'; orderId: string; status: OrderLifecycleStatus }
  | {
      kind: 'apply'
      orderId: string
      plan: ReturnType<typeof planLifecycleTransition>
      stripePaymentIntentId: string
    }

/**
 * Pure finalize planner: webhook handlers call this before touching the DB.
 * Already-paid/fulfilled/refunded orders are treated as successful replays.
 */
export function planStripePaymentSucceeded(input: StripeFinalizeInput): StripeFinalizePlan {
  if (
    input.fromStatus === 'paid' ||
    input.fromStatus === 'fulfilled' ||
    input.fromStatus === 'refunded'
  ) {
    return { kind: 'replay', orderId: input.orderId, status: input.fromStatus }
  }

  const plan = planLifecycleTransition({
    from: input.fromStatus,
    event: 'PAYMENT_SUCCEEDED',
    actor: input.actor ?? 'webhook',
    providerEventId: input.providerEventId,
    payload: {
      provider_payment_id: input.providerPaymentId,
      ...(input.payload ?? {}),
    },
  })

  return {
    kind: 'apply',
    orderId: input.orderId,
    plan,
    stripePaymentIntentId: input.providerPaymentId,
  }
}
